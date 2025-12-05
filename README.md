# YT Summarize

A Node.js command-line tool that fetches YouTube video transcripts and generates AI-powered summaries using OpenAI's GPT model. Perfect for quickly extracting key insights from educational videos, tutorials, podcasts, and other YouTube content.

## Features

- 🎥 **Fetch YouTube Transcripts** - Automatically retrieves closed captions/transcripts from any YouTube video
- 🤖 **AI-Powered Summaries** - Uses OpenAI's GPT-4o-mini to generate concise summaries with main takeaways
- 🌐 **Beautiful HTML Output** - Generates professional HTML summaries that automatically open in your browser
- 💾 **Saves Output** - Stores both full transcripts and formatted HTML summaries as files
- ✅ **Video Validation** - Verifies video exists before processing using YouTube Data API
- 🔒 **Secure** - Uses environment variables for API keys (never hardcoded)

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **YouTube Data API Key** - [Get one here](https://console.developers.google.com/)
- **OpenAI API Key** - [Get one here](https://platform.openai.com/api-keys)

## Installation

1. **Clone or download this repository**
   ```bash
   git clone <your-repo-url>
   cd YTSummarize
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the project root:
   ```bash
   YOUTUBE_API_KEY=your_youtube_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

   **Important:** Never commit your `.env` file to version control. It's already included in `.gitignore`.

## Getting API Keys

### YouTube Data API Key

1. Go to the [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project or select an existing one
3. Enable the "YouTube Data API v3"
4. Go to Credentials → Create Credentials → API Key
5. Copy the API key to your `.env` file

### OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to API Keys section
4. Create a new secret key
5. Copy the API key to your `.env` file

**Note:** OpenAI API usage is pay-per-use. This tool uses the `gpt-4o-mini` model which is cost-effective (~$0.15 per million input tokens).

## Usage

### Basic Usage

```bash
node youtubeSummarize.js VIDEO_ID
```

Replace `VIDEO_ID` with the YouTube video ID (the part after `v=` in the URL).

### Example

For a video with URL: `https://www.youtube.com/watch?v=3hptKYix4X8`

```bash
node youtubeSummarize.js 3hptKYix4X8
```

### What Happens

1. **Validates** the video ID exists using YouTube Data API
2. **Fetches** the video title and metadata
3. **Retrieves** the full transcript using youtubei.js
4. **Saves** the transcript to `transcript_VIDEO_ID.txt`
5. **Sends** the transcript to OpenAI for summarization
6. **Generates** a summary with main takeaways
7. **Saves** the summary to `summary_VIDEO_ID.txt`
8. **Displays** the summary in the console

## Output Files

The tool generates two files per video:

- **`transcript_VIDEO_ID.txt`** - Full transcript of the video
- **`summary_VIDEO_ID.html`** - AI-generated summary in a beautifully formatted HTML page (automatically opens in browser)

Both files are automatically ignored by git (see `.gitignore`).

## Example Output

```
Video found: How to Build a REST API with Node.js
Attempting to fetch transcript for video ID: 3hptKYix4X8
✓ Transcript fetched with 243 segments

Transcript saved to transcript_3hptKYix4X8.txt
Transcript length: 15847 characters.

Sending transcript to OpenAI for summarization...
✓ Summary generated successfully

Summary saved to summary_3hptKYix4X8.html
✓ Summary opened in browser: summary_3hptKYix4X8.html

--- SUMMARY PREVIEW ---
**Main Takeaways:**

1. **Understanding REST APIs**: REST APIs are essential for...
2. **Setting up Express**: The tutorial covers how to set up...
3. **Database Integration**: Learn how to connect MongoDB...
...
--- END SUMMARY ---
```

## Project Structure

```
YTSummarize/
├── youtubeSummarize.js       # Main application script
├── package.json               # Node.js dependencies and metadata
├── .env                       # Environment variables (API keys)
├── .gitignore                 # Files to ignore in git
├── README.md                  # This file
├── transcript_*.txt           # Generated transcripts (ignored by git)
└── summary_*.txt              # Generated summaries (ignored by git)
```

## Dependencies

- **axios** - HTTP client for YouTube Data API requests
- **dotenv** - Loads environment variables from `.env` file
- **openai** - Official OpenAI SDK for GPT integration
- **youtubei.js** - YouTube internal API client for fetching transcripts

## How It Works

### 1. Environment Setup
The script loads API keys from the `.env` file and validates they exist.

### 2. Video Validation
Uses YouTube Data API v3 to verify the video exists and retrieve metadata (title, description, etc.).

### 3. Transcript Retrieval
Uses `youtubei.js` to access YouTube's internal API and fetch the transcript segments. This works even without official captions API access.

### 4. AI Summarization
Sends the transcript to OpenAI's GPT-4o-mini model with a carefully crafted prompt that requests:
- Clear, concise summary
- Main takeaways in bullet points
- Key concepts and insights

### 5. Output Generation
Saves both raw transcript and formatted summary to disk and displays the summary in the console.

## Troubleshooting

### "Please ensure YOUTUBE_API_KEY is set"
- Make sure you created a `.env` file in the project root
- Verify the API key is correctly copied (no extra spaces)
- Check the variable name is exactly `YOUTUBE_API_KEY`

### "Please ensure OPENAI_API_KEY is set"
- Make sure your `.env` file contains `OPENAI_API_KEY`
- Verify your OpenAI API key is valid and active
- Check you have credits available in your OpenAI account

### "Video not found or inaccessible"
- Verify the video ID is correct
- Check if the video is public (private videos won't work)
- Ensure your YouTube API key is valid

### "No transcript could be fetched"
- The video may not have captions/subtitles available
- Try a different video that has closed captions
- Some videos have auto-generated captions that should work

### "Failed to generate summary"
- Check your OpenAI API key is valid
- Verify you have available credits in your OpenAI account
- Check your internet connection
- Review the error message for specific details

## Limitations

- Only works with public YouTube videos
- Requires videos to have captions/transcripts available (auto-generated or manual)
- OpenAI API usage incurs costs (though minimal with gpt-4o-mini)
- Very long videos may hit token limits (can be adjusted in code)

## Configuration

You can customize the summarization by editing `youtubeSummarize.js`:

### Change AI Model
```javascript
model: "gpt-4o-mini",  // Change to "gpt-4o" for better quality (higher cost)
```

### Adjust Summary Length
```javascript
max_tokens: 1000,  // Increase for longer summaries
```

### Modify Temperature
```javascript
temperature: 0.7,  // Lower (0.3) = more focused, Higher (0.9) = more creative
```

## Cost Estimate

Using GPT-4o-mini:
- **Input**: ~$0.15 per 1 million tokens
- **Output**: ~$0.60 per 1 million tokens
- **Average video transcript**: ~2,000-5,000 tokens
- **Cost per summary**: ~$0.001-$0.003 (less than half a cent)

## Privacy & Security

- ✅ API keys stored in `.env` (not committed to git)
- ✅ Transcripts and summaries stored locally
- ✅ No data sent to third parties except OpenAI for summarization
- ⚠️ Transcripts and summaries may contain video content - handle accordingly

## License

MIT License - Feel free to use and modify as needed.

## Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## Future Enhancements

Potential features to add:
- [ ] Support for multiple video IDs in one run
- [ ] Different summary styles (brief, detailed, technical)
- [ ] Export to different formats (PDF, Markdown, JSON)
- [ ] Playlist support
- [ ] Language detection and translation
- [ ] Custom prompts for domain-specific summaries
- [ ] Web interface

## Support

If you encounter issues:
1. Check the Troubleshooting section above
2. Review error messages carefully
3. Verify all API keys are correct and active
4. Check that dependencies are installed (`npm install`)

## Acknowledgments

- **youtubei.js** - For making transcript fetching possible
- **OpenAI** - For providing powerful AI summarization
- **YouTube Data API** - For video metadata access

---

**Happy Summarizing! 🎉**

Made with ❤️ for efficient learning and content consumption.
