require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Innertube } = require('youtubei.js');
const OpenAI = require('openai');

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
 * Summarize the transcript using OpenAI
 */
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
      const summaryFilename = `summary_${videoId}.txt`;
      fs.writeFileSync(summaryFilename, `Video: ${videoTitle}\n\n${summary}`);
      console.log(`\nSummary saved to ${summaryFilename}`);
      console.log('\n--- SUMMARY ---');
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
