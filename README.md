# Express Video Streamer

A web application that converts uploaded videos into HLS and DASH formats for adaptive streaming, built with Express.js.

## Features

- Video upload with drag-and-drop support
- Automatic conversion to HLS and DASH streaming formats
- Video player supporting both HLS and DASH playback
- Progress tracking for uploads
- Responsive web interface using Tailwind CSS
- Video listing and management

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg installed on the system
- npm or yarn package manager

## Development Environment Setup

1. Fork and Clone the repository:
```bash
git clone https://github.com/yourusername/express-streamer.git
cd express-streamer
```

2. Install dependencies:
```bash
npm install
```

3. Create required directories:
```bash
mkdir uploads streams
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to `http://localhost:5000`

3. Upload videos using the web interface

4. Access converted streams through the video player or direct stream URLs

## Environment Variables

- `PORT` - Server port (default: 5000)

## Technical Details

- Video formats supported: mp4, avi, mov, mkv, wmv, flv, webm
- Maximum upload size: 100MB
- Streaming formats: HLS (.m3u8) and DASH (.mpd)
- Frontend: HTML, Tailwind CSS, Alpine.js
- Backend: Express.js, FFmpeg

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
