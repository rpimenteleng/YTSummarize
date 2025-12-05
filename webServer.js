require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
// const { Innertube } = require('youtubei.js'); // Remove this - will use dynamic import
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI (will be set dynamically from user input)
let openai = null;

/**
 * Fetch video details to verify the video exists
 */
async function getVideoDetails(videoId, apiKey) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const response = await axios.get(url);
    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0];
    }
    return null;
  } catch (error) {
    console.error('Error fetching video details:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Fetch the transcript using youtubei.js
 */
async function fetchTranscript(videoId) {
  console.log(`Attempting to fetch transcript for video ID: ${videoId}`);
  try {
    // Dynamic import for ES module
    const { Innertube } = await import('youtubei.js');

    const youtube = await Innertube.create();
    const info = await youtube.getInfo(videoId);

    const transcriptData = await info.getTranscript();

    if (transcriptData && transcriptData.transcript) {
      const segments = transcriptData.transcript.content.body.initial_segments;

      if (segments && segments.length > 0) {
        const transcriptText = segments.map(seg => seg.snippet.text).join(' ');
        console.log(`✓ Transcript fetched with ${segments.length} segments`);
        return transcriptText;
      }
    }

    console.log('No transcript segments found.');
    return null;
  } catch (error) {
    console.error(`Failed to fetch transcript: ${error.message}`);
    return null;
  }
}/**
 * Summarize the transcript using OpenAI
 */
async function summarizeTranscript(transcript, videoTitle, aiProvider = 'openai', apiKey) {
  console.log(`\nSending transcript to ${aiProvider.toUpperCase()} for summarization...`);

  try {
    if (aiProvider === 'openai') {
      return await summarizeWithOpenAI(transcript, videoTitle, apiKey);
    } else if (aiProvider === 'gemini') {
      return await summarizeWithGemini(transcript, videoTitle, apiKey);
    } else {
      throw new Error(`Unsupported AI provider: ${aiProvider}`);
    }
  } catch (error) {
    console.error(`Failed to generate summary with ${aiProvider}:`, error.message);
    throw error;
  }
}

async function summarizeWithOpenAI(transcript, videoTitle, apiKey) {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that summarizes YouTube video transcripts. Provide ONLY the main takeaways in bullet point format."
      },
      {
        role: "user",
        content: `Please summarize the following YouTube video transcript and provide ONLY the main takeaways in bullet point format.

Video Title: ${videoTitle}

Transcript:
${transcript}

IMPORTANT: Your response should ONLY contain bullet points with the key takeaways. Do not include any introductory text, conclusions, or explanations. Start directly with the bullet points.`
      }
    ],
    temperature: 0.7,
    max_tokens: 1000
  });

  return response.choices[0].message.content;
}

async function summarizeWithGemini(transcript, videoTitle, apiKey) {
  try {
    // First, check if the API key is valid by testing a simple request
    console.log('Validating Gemini API key...');
    const testResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!testResponse.ok) {
      const errorData = await testResponse.json();
      throw new Error(`Invalid Gemini API key: ${errorData.error?.message || 'Unknown error'}`);
    }

    const modelsData = await testResponse.json();
    console.log('Available Gemini models:', modelsData.models?.map(m => m.name).join(', ') || 'No models found');

    // Find a working text generation model (not embedding models)
    const availableModels = modelsData.models?.map(m => m.name.replace('models/', '')) || [];
    console.log('Parsed available models:', availableModels.slice(0, 10).join(', ') + '...'); // Show first 10

    const textGenerationModels = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash', 'gemini-pro-latest', 'gemini-flash-latest', 'gemini-2.0-pro-exp'];
    console.log('Looking for preferred models:', textGenerationModels);

    const modelToUse = textGenerationModels.find(m => availableModels.includes(m)) ||
                      availableModels.find(m => m.includes('gemini') && !m.includes('embedding')) ||
                      availableModels[0];

    console.log('Selected model:', modelToUse);

    if (!modelToUse) {
      throw new Error('No suitable Gemini models found');
    }

    console.log(`Using Gemini model: ${modelToUse}`);

    const prompt = `Please summarize the following YouTube video transcript and provide ONLY the main takeaways in bullet point format.

Video Title: ${videoTitle}

Transcript:
${transcript}

IMPORTANT: Your response should ONLY contain bullet points with the key takeaways. Do not include any introductory text, conclusions, or explanations. Start directly with the bullet points.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000, // Increased for longer summaries
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.log('Gemini API error response:', errorData);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('Gemini API success response structure:', JSON.stringify(data, null, 2));

    // Handle different response formats
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];

      // Check if response was truncated
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('Response was truncated due to token limit. Try a shorter transcript or increase token limit.');
      }

      // Check if content has parts
      if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
        return candidate.content.parts[0].text;
      } else {
        console.error('Response missing content parts:', candidate);
        throw new Error('Gemini API returned incomplete response');
      }
    } else {
      console.error('Unexpected response structure:', data);
      throw new Error('Unexpected Gemini API response format');
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Generate HTML content for the summary
 */
function generateSummaryHTML(videoTitle, summary, videoId) {
  const currentDate = new Date().toLocaleDateString();
  const currentTime = new Date().toLocaleTimeString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YouTube Video Summary - ${videoTitle}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .video-title {
            color: #1a1a1a;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        .video-link {
            color: #0654ba;
            text-decoration: none;
            font-size: 16px;
        }
        .video-link:hover {
            text-decoration: underline;
        }
        .metadata {
            color: #666;
            font-size: 14px;
            margin-top: 10px;
        }
        .summary-section {
            margin-bottom: 30px;
        }
        .section-title {
            color: #2c3e50;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            border-left: 4px solid #3498db;
            padding-left: 15px;
        }
        .summary-content {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #3498db;
            white-space: pre-line;
            font-size: 16px;
            line-height: 1.7;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .back-button {
            display: inline-block;
            margin-top: 20px;
            padding: 10px 20px;
            background: #3498db;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 500;
        }
        .back-button:hover {
            background: #2980b9;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="video-title">${videoTitle}</h1>
            <a href="https://www.youtube.com/watch?v=${videoId}" class="video-link" target="_blank">
                Watch on YouTube ↗
            </a>
            <div class="metadata">
                Generated on ${currentDate} at ${currentTime}
            </div>
        </div>

        <div class="summary-section">
            <h2 class="section-title">📋 AI-Generated Summary</h2>
            <div class="summary-content">${summary}</div>
        </div>

        <div class="footer">
            <p>Generated by YT Summarize - AI-powered YouTube transcript analysis</p>
            <a href="/" class="back-button">← Summarize Another Video</a>
        </div>
    </div>
</body>
</html>`;
}

// Download routes
app.get('/download/transcript/:videoId', (req, res) => {
  const { videoId } = req.params;
  const filename = `transcript_${videoId}.txt`;
  
  if (fs.existsSync(filename)) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, filename));
  } else {
    res.status(404).json({ error: 'Transcript file not found' });
  }
});

app.get('/download/summary/:videoId', (req, res) => {
  const { videoId } = req.params;
  const filename = `summary_${videoId}.html`;
  
  if (fs.existsSync(filename)) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, filename));
  } else {
    res.status(404).json({ error: 'Summary file not found' });
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/summarize', async (req, res) => {
  const { youtubeKey, aiProvider, openaiKey, geminiKey, videoId } = req.body;

  if (!youtubeKey || !videoId) {
    return res.status(400).json({
      error: 'Missing required fields: YouTube API key and video ID are required.'
    });
  }

  if (aiProvider === 'openai' && !openaiKey) {
    return res.status(400).json({
      error: 'OpenAI API key is required when using OpenAI.'
    });
  }

  if (aiProvider === 'gemini' && !geminiKey) {
    return res.status(400).json({
      error: 'Google Gemini API key is required when using Gemini.'
    });
  }

  if (!aiProvider || !['openai', 'gemini'].includes(aiProvider)) {
    return res.status(400).json({
      error: 'Invalid AI provider. Must be "openai" or "gemini".'
    });
  }

  try {
    // Initialize OpenAI with user's key
    openai = new OpenAI({ apiKey: openaiKey });

    // First verify the video exists
    const videoDetails = await getVideoDetails(videoId, youtubeKey);
    if (!videoDetails) {
      return res.status(404).json({
        error: 'Video not found or inaccessible. Please check the video ID.'
      });
    }

    const videoTitle = videoDetails.snippet.title;
    console.log(`Video found: ${videoTitle}`);

    // Fetch transcript
    const transcript = await fetchTranscript(videoId);
    if (!transcript) {
      return res.status(404).json({
        error: 'No transcript could be fetched. The video may not have captions available.'
      });
    }

    console.log(`Transcript fetched successfully (${transcript.length} characters)`);

    // Generate summary
    const apiKey = aiProvider === 'openai' ? openaiKey : geminiKey;
    const summary = await summarizeTranscript(transcript, videoTitle, aiProvider, apiKey);
    if (!summary) {
      return res.status(500).json({
        error: `Failed to generate summary with ${aiProvider.toUpperCase()}. Please check your API key and try again.`
      });
    }

    // Generate HTML summary
    const htmlContent = generateSummaryHTML(videoTitle, summary, videoId);

    console.log('Summary generated successfully');

    // Return success response with summary data
    res.json({
      success: true,
      videoTitle,
      summary,
      transcript,
      htmlContent,
      transcriptLength: transcript.length
    });

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: 'An unexpected error occurred. Please try again.'
    });
  }
});

// Export for Vercel serverless functions
module.exports = app;

// Only start server if not in Vercel environment
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 YT Summarize Web UI running at http://localhost:${PORT}`);
    console.log(`📱 Open your browser and visit the URL above to start summarizing YouTube videos!`);
  });
}