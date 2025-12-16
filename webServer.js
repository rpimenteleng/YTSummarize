require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
// const { Innertube } = require('youtubei.js'); // Remove this - will use dynamic import
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// const { paymentMiddleware } = require('x402-express'); // Removed - using direct donations
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

// Initialize OpenAI (will be set dynamically per request)
let openai = null;

/**
 * Check if URL is a Twitter/X URL
 */
function isTwitterUrl(url) {
  return /twitter\.com|x\.com/.test(url) && /status\/\d+/.test(url);
}

/**
 * Extract tweet ID from Twitter/X URL
 */
function extractTweetId(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Process Twitter/X video using Gemini's video understanding
 * Uses a third-party service to get video URL, then Gemini to analyze
 */
async function processTwitterVideo(tweetUrl, apiKey) {
  console.log('Processing Twitter/X video:', tweetUrl);
  
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    throw new Error('Could not extract tweet ID from URL');
  }

  try {
    // Method 1: Use fxtwitter.com API (free, no auth required)
    // This service provides video URLs from tweets
    const fxUrl = `https://api.fxtwitter.com/status/${tweetId}`;
    console.log('Fetching tweet data from fxtwitter:', fxUrl);
    
    const response = await axios.get(fxUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const tweetData = response.data;
    
    if (!tweetData.tweet) {
      throw new Error('Could not fetch tweet data');
    }

    const tweet = tweetData.tweet;
    const tweetText = tweet.text || '';
    const authorName = tweet.author?.name || 'Unknown';
    
    // Check for video in media
    let videoUrl = null;
    if (tweet.media?.videos && tweet.media.videos.length > 0) {
      // Get the highest quality video URL
      const video = tweet.media.videos[0];
      videoUrl = video.url || (video.variants && video.variants[video.variants.length - 1]?.url);
    } else if (tweet.media?.all && tweet.media.all.length > 0) {
      // Check in 'all' media array
      for (const media of tweet.media.all) {
        if (media.type === 'video' && media.url) {
          videoUrl = media.url;
          break;
        }
      }
    }

    if (!videoUrl) {
      throw new Error('No video found in this tweet. Make sure the tweet contains a video.');
    }

    console.log('Found video URL:', videoUrl);

    // Use Gemini to analyze the video directly via URL
    const summary = await analyzeVideoWithGemini(videoUrl, tweetText, authorName, apiKey);
    
    return {
      videoTitle: `Twitter Video by @${authorName}`,
      transcript: `Tweet: ${tweetText}\n\n[Video content analyzed by AI]`,
      summary: summary,
      tweetId: tweetId
    };

  } catch (error) {
    console.error('Twitter video processing error:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('No video found')) {
      throw error;
    } else if (error.response?.status === 404) {
      throw new Error('Tweet not found. Make sure the tweet exists and is public.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Please try again.');
    } else {
      throw new Error(`Failed to process Twitter video: ${error.message}`);
    }
  }
}

/**
 * Analyze video using Gemini's video understanding capability
 */
async function analyzeVideoWithGemini(videoUrl, tweetText, authorName, apiKey) {
  console.log('Analyzing video with Gemini...');

  // Download video to buffer for Gemini (since Gemini File API needs the actual file)
  // For serverless, we'll use inline data with size limits
  
  try {
    // Download video (limited to ~15MB for inline processing)
    const videoResponse = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 15 * 1024 * 1024, // 15MB limit
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const videoBase64 = Buffer.from(videoResponse.data).toString('base64');
    const videoSize = videoResponse.data.length / (1024 * 1024);
    console.log(`Video downloaded: ${videoSize.toFixed(2)}MB`);

    // Determine mime type from URL or default to mp4
    let mimeType = 'video/mp4';
    if (videoUrl.includes('.webm')) mimeType = 'video/webm';
    else if (videoUrl.includes('.mov')) mimeType = 'video/mov';

    const prompt = `You are analyzing a Twitter/X video. Please provide a comprehensive summary formatted as HTML.

Tweet text: "${tweetText}"
Posted by: @${authorName}

Please analyze the video and format your response as clean HTML:

1. Use <h3>🎬 Video Description</h3> followed by a <p> describing what's happening
2. Use <h3>🗣️ Spoken Content</h3> with a <p> for any transcribed dialogue (if applicable)
3. Use <h3>📌 Key Takeaways</h3> followed by <ul><li> bullet points
4. Use <h3>💡 Conclusion</h3> with a <p> for the final summary

Style guidelines:
- Use <strong> to emphasize key terms or concepts
- Keep the HTML simple and clean (no CSS classes needed)
- Do NOT include <html>, <head>, <body> tags - just the content
- Do NOT wrap in code blocks or markdown
- If no spoken content, you can skip that section

Start directly with the <h3> tag.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: videoBase64
              }
            },
            {
              text: prompt
            }
          ]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini video analysis error:', errorData);
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Unexpected Gemini response format');
    }

  } catch (error) {
    if (error.message.includes('maxContentLength')) {
      throw new Error('Video is too large to process. Maximum size is 15MB.');
    }
    throw error;
  }
}

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
    const { Innertube, UniversalCache } = await import('youtubei.js');

    // Create Innertube instance with cache to help with API stability
    const youtube = await Innertube.create({
      cache: new UniversalCache(false), // Disable caching for fresh requests
      generate_session_locally: true,   // Generate session locally to avoid some API issues
    });

    const info = await youtube.getInfo(videoId);

    // Try to get transcript
    let transcriptData;
    try {
      transcriptData = await info.getTranscript();
    } catch (transcriptError) {
      console.log(`Direct transcript fetch failed: ${transcriptError.message}`);
      
      // Fallback: try to get captions from the video info
      if (info.captions && info.captions.caption_tracks && info.captions.caption_tracks.length > 0) {
        console.log('Attempting fallback via caption tracks...');
        const captionTrack = info.captions.caption_tracks.find(track => track.language_code === 'en') 
                          || info.captions.caption_tracks[0];
        
        if (captionTrack && captionTrack.base_url) {
          const captionResponse = await axios.get(captionTrack.base_url);
          // Parse XML captions
          const captionText = captionResponse.data
            .replace(/<[^>]*>/g, ' ')  // Remove XML tags
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (captionText) {
            console.log(`✓ Transcript fetched via caption track fallback`);
            return captionText;
          }
        }
      }
      
      throw transcriptError;
    }

    if (transcriptData && transcriptData.transcript) {
      const segments = transcriptData.transcript.content?.body?.initial_segments;

      if (segments && segments.length > 0) {
        const transcriptText = segments.map(seg => seg.snippet?.text || '').filter(Boolean).join(' ');
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
        content: "You are a helpful assistant that summarizes YouTube video transcripts. Format your response as clean HTML that can be displayed directly in a web page."
      },
      {
        role: "user",
        content: `Please summarize the following YouTube video transcript and format the output as HTML.

Video Title: ${videoTitle}

Transcript:
${transcript}

IMPORTANT: Format your response as clean HTML with the following structure:
1. Use <h3>📌 Key Takeaways</h3> as a header
2. Use <ul> with <li> elements for bullet points (use emoji bullets like • or ▸)
3. Use <h3>💡 Conclusion</h3> as header for the conclusion
4. Use <p> for the conclusion paragraph

Style guidelines:
- Make bullet points concise but insightful
- Use <strong> to emphasize key terms or concepts
- Keep the HTML simple and clean (no CSS classes needed)
- Do NOT include <html>, <head>, <body> tags - just the content
- Do NOT wrap in code blocks or markdown

Start directly with the <h3> tag.`
      }
    ],
    temperature: 0.7,
    max_tokens: 2000
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

    // Only use gemini-2.5-flash - no fallbacks
    const modelToUse = 'gemini-2.5-flash';

    if (!availableModels.includes(modelToUse)) {
      throw new Error(`Required model 'gemini-2.5-flash' is not available. Please check your Gemini API access.`);
    }

    console.log('Selected model:', modelToUse);

    if (!modelToUse) {
      throw new Error('No suitable Gemini models found');
    }

    console.log(`Using Gemini model: ${modelToUse}`);

    const prompt = `Please provide a thorough summary with the most prescient insights from the following YouTube video transcript. Format the output as HTML.

Video Title: ${videoTitle}

Transcript:
${transcript}

IMPORTANT: Format your response as clean HTML with the following structure:
1. Use <h3>📌 Key Takeaways</h3> as a header
2. Use <ul> with <li> elements for bullet points
3. Use <h3>💡 Conclusion</h3> as header for the conclusion
4. Use <p> for the conclusion paragraph

Style guidelines:
- Make bullet points concise but insightful
- Use <strong> to emphasize key terms or concepts
- Keep the HTML simple and clean (no CSS classes needed)
- Do NOT include <html>, <head>, <body> tags - just the content
- Do NOT wrap in code blocks or markdown

Start directly with the <h3> tag.`;

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
            <p>Generated by VidReduce - AI-powered YouTube transcript analysis</p>
            <a href="/" class="back-button">← Summarize Another Video</a>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML content for Twitter video summary
 */
function generateTwitterSummaryHTML(videoTitle, summary, tweetUrl, tweetId) {
  const currentDate = new Date().toLocaleDateString();
  const currentTime = new Date().toLocaleTimeString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Twitter Video Summary - ${videoTitle}</title>
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
            border-bottom: 2px solid #1da1f2;
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
            color: #1da1f2;
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
            border-left: 4px solid #1da1f2;
            padding-left: 15px;
        }
        .summary-content {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #1da1f2;
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
            background: #1da1f2;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 500;
        }
        .back-button:hover {
            background: #0c85d0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="video-title">${videoTitle}</h1>
            <a href="${tweetUrl}" class="video-link" target="_blank">
                View on Twitter/X ↗
            </a>
            <div class="metadata">
                Generated on ${currentDate} at ${currentTime}
            </div>
        </div>

        <div class="summary-section">
            <h2 class="section-title">📋 AI-Generated Video Analysis</h2>
            <div class="summary-content">${summary}</div>
        </div>

        <div class="footer">
            <p>Generated by VidReduce - AI-powered video analysis</p>
            <a href="/" class="back-button">← Analyze Another Video</a>
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

// Check if environment variables are configured
app.get('/api/config', (req, res) => {
  const hasYouTubeKey = !!process.env.YOUTUBE_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;

  res.json({
    hasEnvKeys: hasYouTubeKey && (hasOpenAIKey || hasGeminiKey),
    hasYouTubeKey,
    hasOpenAIKey,
    hasGeminiKey
  });
});

// Remove x402 middleware - using direct crypto donations instead
// app.use(paymentMiddleware(...));

// Simple donation endpoint that shows wallet info for multiple networks
app.get('/donate', (req, res) => {
  res.json({
    message: 'Thank you for considering a donation!',
    wallets: {
      ethereum: process.env.DONATION_WALLET,
      polygon: process.env.DONATION_WALLET,
      base: process.env.DONATION_WALLET,
      arbitrum: process.env.DONATION_WALLET
    },
    supportedNetworks: ['ethereum', 'polygon', 'base', 'arbitrum'],
    preferredToken: 'USDC',
    amount: 'Any amount appreciated',
    instructions: 'Send USDC to any of the wallet addresses on supported networks'
  });
});

app.post('/donate', (req, res) => {
  res.json({
    message: 'Thank you for your donation!',
    wallets: {
      ethereum: process.env.DONATION_WALLET,
      polygon: process.env.DONATION_WALLET,
      base: process.env.DONATION_WALLET,
      arbitrum: process.env.DONATION_WALLET
    },
    supportedNetworks: ['ethereum', 'polygon', 'base', 'arbitrum'],
    preferredToken: 'USDC'
  });
});

app.post('/summarize', async (req, res) => {
  const { youtubeKey, aiProvider, openaiKey, geminiKey, videoId, videoUrl } = req.body;

  // Check if environment variables are available
  const hasEnvYouTubeKey = process.env.YOUTUBE_API_KEY;
  const hasEnvOpenAIKey = process.env.OPENAI_API_KEY;
  const hasEnvGeminiKey = process.env.GEMINI_API_KEY;

  // Use environment variables if available, otherwise use form data
  const finalYouTubeKey = hasEnvYouTubeKey || youtubeKey;
  const finalOpenAIKey = hasEnvOpenAIKey || openaiKey;
  const finalGeminiKey = hasEnvGeminiKey || geminiKey;

  // Determine AI provider - default to gemini if available
  const finalAiProvider = aiProvider || (finalGeminiKey ? 'gemini' : 'openai');

  // Check if this is a Twitter/X URL
  const inputUrl = videoUrl || videoId;
  const isTwitter = isTwitterUrl(inputUrl);

  if (isTwitter) {
    // Twitter/X video processing (requires Gemini)
    if (!finalGeminiKey) {
      return res.status(400).json({
        error: 'Gemini API key is required for Twitter/X video processing.'
      });
    }

    try {
      console.log('Processing Twitter/X video...');
      const result = await processTwitterVideo(inputUrl, finalGeminiKey);
      
      // Generate HTML content for Twitter video
      const htmlContent = generateTwitterSummaryHTML(result.videoTitle, result.summary, inputUrl, result.tweetId);

      res.json({
        success: true,
        videoTitle: result.videoTitle,
        summary: result.summary,
        transcript: result.transcript,
        htmlContent,
        source: 'twitter'
      });

    } catch (error) {
      console.error('Twitter video processing error:', error);
      res.status(500).json({
        error: error.message || 'Failed to process Twitter video.'
      });
    }
    return;
  }

  // YouTube video processing
  if (!finalYouTubeKey || !videoId) {
    return res.status(400).json({
      error: 'Missing required fields: YouTube API key and video ID are required.'
    });
  }

  if (finalAiProvider === 'openai' && !finalOpenAIKey) {
    return res.status(400).json({
      error: 'OpenAI API key is required when using OpenAI.'
    });
  }

  if (finalAiProvider === 'gemini' && !finalGeminiKey) {
    return res.status(400).json({
      error: 'Google Gemini API key is required when using Gemini.'
    });
  }

  if (!finalAiProvider || !['openai', 'gemini'].includes(finalAiProvider)) {
    return res.status(400).json({
      error: 'Invalid AI provider. Must be "openai" or "gemini".'
    });
  }

  try {
    // First verify the video exists
    const videoDetails = await getVideoDetails(videoId, finalYouTubeKey);
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
    const apiKey = aiProvider === 'openai' ? finalOpenAIKey : finalGeminiKey;
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
    
    // Extract meaningful error message for the user
    let userMessage = 'An unexpected error occurred. Please try again.';
    
    if (error.message) {
      // Check for known error patterns and provide friendly messages
      if (error.message.includes('overloaded') || error.message.includes('503')) {
        userMessage = 'The AI model is currently overloaded. Please try again in a few moments.';
      } else if (error.message.includes('quota') || error.message.includes('429')) {
        userMessage = 'API rate limit reached. Please wait a moment and try again.';
      } else if (error.message.includes('Invalid API key') || error.message.includes('401')) {
        userMessage = 'Invalid API key. Please check your API key and try again.';
      } else if (error.message.includes('Gemini API error') || error.message.includes('OpenAI')) {
        // Pass through API-specific errors
        userMessage = error.message;
      } else {
        // For other errors, include the actual message
        userMessage = error.message;
      }
    }
    
    res.status(500).json({
      error: userMessage
    });
  }
});

// Export for Vercel serverless functions
module.exports = app;

// Only start server if not in Vercel environment
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 VidReduce Web UI running at http://localhost:${PORT}`);
    console.log(`📱 Open your browser and visit the URL above to start summarizing YouTube videos!`);
  });
}