# VidReduce

A powerful YouTube video summarizer with a beautiful web interface. Extract key insights from any YouTube video using OpenAI GPT or Google Gemini AI models. Perfect for quickly understanding educational content, tutorials, podcasts, and videos.

## ✨ Features

- 🌐 **Beautiful Web Interface** - Modern, responsive web UI with real-time processing
- 🎥 **YouTube Transcript Fetching** - Automatically retrieves closed captions from videos
- 🤖 **AI-Powered Summaries** - Uses OpenAI GPT-4o-mini or Google Gemini Pro for intelligent summarization
- 🎨 **Professional HTML Output** - Generates beautiful, formatted summary reports
- 📱 **Mobile-Friendly** - Responsive design works on all devices
- 🔒 **Secure API Handling** - API keys entered securely (never stored)
- 🚀 **Deployment Flexible** - Works locally or deploy anywhere (Vercel, Railway, Heroku, etc.)
- ⚡ **Fast Processing** - Optimized for quick results

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **YouTube Data API Key** - [Get one here](https://console.developers.google.com/)
- **AI API Key** - Either [OpenAI API Key](https://platform.openai.com/api-keys) or [Google Gemini API Key](https://makersuite.google.com/app/apikey)

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
   # OR for Google Gemini:
   GEMINI_API_KEY=your_gemini_api_key_here
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

### Google Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key to your `.env` file

**Note:** Google Gemini API has a generous free tier and uses the `gemini-2.5-pro` model for high-quality summarization.

## Usage

### Web Interface (Recommended)
The easiest way to use VidReduce is through the web interface:

```bash
npm run web
```

Then open your browser and visit `http://localhost:3000`

**Features:**
- 🎨 Beautiful, modern web interface
- 🤖 Choose between OpenAI GPT-4o-mini or Google Gemini 2.5 Pro
- 🔐 Secure API key input (not stored)
- 📱 Mobile-friendly responsive design
- ⚡ Real-time processing with loading indicators
- 📄 Automatic HTML summary generation
- 🔗 Direct YouTube video links

## 🌐 Deployment

The app is **deployment-agnostic** - deploy anywhere that supports Node.js!

### Local Development
```bash
npm run web  # Web interface on http://localhost:3000
```

### Cloud Deployment Options

#### Vercel (Recommended)
```bash
npm install -g vercel
vercel login
vercel
# Set environment variables in Vercel dashboard
```

#### Railway
```bash
npm install -g @railway/cli
railway login
railway deploy
```

#### Render
1. Connect your GitHub repo
2. Choose "Web Service"
3. Set build command: `npm install`
4. Set start command: `npm run web`

#### Heroku
```bash
heroku create your-app-name
git push heroku main
```

#### DigitalOcean App Platform
1. Connect GitHub repo
2. Set runtime to Node.js
3. Configure environment variables

## Project Structure

```
YTSummarize/
├── webServer.js              # Express.js web server
├── public/
│   └── index.html            # Web interface HTML
├── package.json               # Node.js dependencies and metadata
├── .env                       # Environment variables (API keys)
├── .gitignore                 # Files to ignore in git
├── README.md                  # This file
├── transcript_*.txt           # Generated transcripts (ignored by git)
└── summary_*.html             # Generated summaries (ignored by git)
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

You can customize the summarization by editing `webServer.js`:

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

## 🚀 Deployment to Vercel

### Prerequisites
1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI**: Install globally
   ```bash
   npm install -g vercel
   ```

### Step-by-Step Deployment

1. **Login to Vercel**
   ```bash
   vercel login
   ```

2. **Deploy to Vercel**
   ```bash
   vercel
   ```
   - Choose your account when prompted
   - Confirm the project settings
   - Vercel will detect your Node.js app automatically

3. **Set Environment Variables**
   In your Vercel dashboard or via CLI:
   ```bash
   vercel env add YOUTUBE_API_KEY
   vercel env add OPENAI_API_KEY
   ```
   Or set them in the Vercel dashboard under Project Settings → Environment Variables

4. **Redeploy** (if you set env vars after initial deployment)
   ```bash
   vercel --prod
   ```

### Your App will be Live! 🎉

Vercel will provide you with a URL like: `https://your-project.vercel.app`

### Troubleshooting

- **Build Errors**: Check that all dependencies are in `package.json`
- **Environment Variables**: Make sure they're set in Vercel dashboard
- **Cold Starts**: First request may be slow (normal for serverless)
- **File Paths**: Vercel uses Linux paths, ensure you're using `path.join()`

### Cost
- **Free Tier**: 100GB bandwidth, 100GB hours
- **Hobby Plan**: $0/month (if eligible) or $7/month
- **Pro Plan**: $20/month for higher limits

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
