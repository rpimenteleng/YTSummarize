require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Innertube } = require('youtubei.js');
const OpenAI = require('openai');
const { exec } = require('child_process');

const API_KEY = process.env.YOUTUBE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error('ERROR: Please ensure YOUTUBE_API_KEY is set in your .env file.');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('ERROR: Please ensure OPENAI_API_KEY is set in your .env file.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Get video ID from command line arguments
const videoId = process.argv[2];

if (!videoId) {
  console.error('ERROR: Please provide a video ID as a command line argument.');
  console.log('Usage: node fetchVideoTranscript.js VIDEO_ID');
  process.exit(1);
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
        .stats {
            background: #e8f4fd;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #2c3e50;
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
        </div>
    </div>
</body>
</html>`;
}

/**
 * Open HTML file in default browser
 */
function openInBrowser(filePath) {
  const command = process.platform === 'win32' ? `start "" "${filePath}"` :
                  process.platform === 'darwin' ? `open "${filePath}"` :
                  `xdg-open "${filePath}"`;

  exec(command, (error) => {
    if (error) {
      console.log(`Could not automatically open browser. File saved to: ${filePath}`);
    } else {
      console.log(`✓ Summary opened in browser: ${filePath}`);
    }
  });
}
async function summarizeTranscript(transcript, videoTitle) {
  console.log('\nSending transcript to OpenAI for summarization...');
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes YouTube video transcripts. Provide clear, concise summaries with the main takeaways."
        },
        {
          role: "user",
          content: `Please summarize the following YouTube video transcript and provide the main takeaways.\n\nVideo Title: ${videoTitle}\n\nTranscript:\n${transcript}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const summary = response.choices[0].message.content;
    console.log('✓ Summary generated successfully');
    return summary;
  } catch (error) {
    console.error(`Failed to generate summary: ${error.message}`);
    return null;
  }
}

// Execute the transcript fetch
async function run() {
  // First verify the video exists
  const videoDetails = await getVideoDetails(videoId, API_KEY);
  if (!videoDetails) {
    console.error(`Video ${videoId} not found or inaccessible.`);
    process.exit(1);
  }
  
  const videoTitle = videoDetails.snippet.title;
  console.log(`Video found: ${videoTitle}`);
  
  const transcript = await fetchTranscript(videoId);
  
  if (transcript) {
    const transcriptFilename = `transcript_${videoId}.txt`;
    fs.writeFileSync(transcriptFilename, transcript);
    console.log(`\nTranscript saved to ${transcriptFilename}`);
    console.log(`Transcript length: ${transcript.length} characters.`);
    
    // Generate summary using OpenAI
    const summary = await summarizeTranscript(transcript, videoTitle);
    
    if (summary) {
      const summaryFilename = `summary_${videoId}.html`;
      const htmlContent = generateSummaryHTML(videoTitle, summary, videoId);
      fs.writeFileSync(summaryFilename, htmlContent);
      console.log(`\nSummary saved to ${summaryFilename}`);

      // Open the HTML file in the default browser
      openInBrowser(summaryFilename);

      console.log('\n--- SUMMARY PREVIEW ---');
      console.log(summary);
      console.log('--- END SUMMARY ---\n');
    } else {
      console.error('Failed to generate summary.');
    }
  } else {
    console.error('No transcript could be fetched. The video may not have captions available.');
  }
}

run().catch(error => {
  console.error('An error occurred:', error);
});
