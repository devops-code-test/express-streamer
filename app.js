const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const logger = require('morgan');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger('dev'));

// Serve static files
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Configuration
const UPLOAD_FOLDER = 'uploads';
const OUTPUT_FOLDER = 'streams';
const ALLOWED_EXTENSIONS = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'];
const MAX_CONTENT_LENGTH = 100 * 1024 * 1024; // 100MB max upload size

// Create necessary directories
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER);
}
if (!fs.existsSync(OUTPUT_FOLDER)) {
  fs.mkdirSync(OUTPUT_FOLDER);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const videoId = uuidv4();
    const videoUploadDir = path.join(UPLOAD_FOLDER, videoId);
    
    // Create directories for this video
    fs.mkdirSync(videoUploadDir, { recursive: true });
    fs.mkdirSync(path.join(OUTPUT_FOLDER, videoId), { recursive: true });
    
    // Store videoId in request for later use
    req.videoId = videoId;
    cb(null, videoUploadDir);
  },
  filename: function (req, file, cb) {
    const filename = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const extension = file.originalname.split('.').pop().toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

// Initialize upload middleware
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: MAX_CONTENT_LENGTH }
});

// Helper functions for video conversion
function convertToHLS(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true });
    
    const hlsPlaylist = path.join(outputDir, 'playlist.m3u8');
    
    // HLS conversion command
    const hlsCmd = `ffmpeg -i "${inputPath}" -profile:v baseline -level 3.0 -start_number 0 -hls_time 10 -hls_list_size 0 -f hls "${hlsPlaylist}"`;
    
    exec(hlsCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`HLS conversion failed: ${error}`);
        reject(error);
        return;
      }
      console.log(`HLS conversion completed for ${inputPath}`);
      resolve(true);
    });
  });
}

function convertToDASH(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true });
    
    const dashPlaylist = path.join(outputDir, 'manifest.mpd');
    
    // DASH conversion command
    const dashCmd = `ffmpeg -i "${inputPath}" -map 0:v -map 0:a -c:v libx264 -x264-params "keyint=60:min-keyint=60:no-scenecut=1" -b:v:0 1500k -c:a aac -b:a 128k -bf 1 -keyint_min 60 -g 60 -sc_threshold 0 -f dash -use_template 1 -use_timeline 1 -init_seg_name "init-$RepresentationID$.m4s" -media_seg_name "chunk-$RepresentationID$-$Number%05d$.m4s" -adaptation_sets "id=0,streams=v id=1,streams=a" "${dashPlaylist}"`;
    
    exec(dashCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`DASH conversion failed: ${error}`);
        reject(error);
        return;
      }
      console.log(`DASH conversion completed for ${inputPath}`);
      resolve(true);
    });
  });
}

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const videoId = req.videoId;
    const filePath = req.file.path;
    
    // Create directories for each format
    const streamOutputDir = path.join(OUTPUT_FOLDER, videoId);
    const hlsOutputDir = path.join(streamOutputDir, 'hls');
    const dashOutputDir = path.join(streamOutputDir, 'dash');
    
    // Process video (no longer async as we'll wait for it in this route)
    try {
      // Run conversions in parallel
      await Promise.all([
        convertToHLS(filePath, hlsOutputDir),
        convertToDASH(filePath, dashOutputDir)
      ]);
      
      res.json({
        id: videoId,
        status: 'success',
        hls_url: `/stream/${videoId}/hls/playlist.m3u8`,
        dash_url: `/stream/${videoId}/dash/manifest.mpd`,
        player_url: `/player/${videoId}`
      });
    } catch (error) {
      console.error('Conversion error:', error);
      res.status(500).json({ error: 'Conversion failed' });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/stream/:videoId/:formatType/*', (req, res) => {
  const videoId = req.params.videoId;
  const formatType = req.params.formatType;
  const filePath = req.path.split(`/stream/${videoId}/${formatType}/`)[1];
  
  const directory = path.join(OUTPUT_FOLDER, videoId, formatType);
  res.sendFile(path.resolve(directory, filePath));
});

app.get('/player/:videoId', (req, res) => {
  const videoId = req.params.videoId;
  const hlsUrl = `/stream/${videoId}/hls/playlist.m3u8`;
  const dashUrl = `/stream/${videoId}/dash/manifest.mpd`;
  
  res.render('player', {
    video_id: videoId,
    hls_url: hlsUrl,
    dash_url: dashUrl
  });
});

app.get('/videos', (req, res) => {
  const videos = [];
  
  try {
    // Get all subdirectories in the streams folder
    const streamDirs = fs.readdirSync(OUTPUT_FOLDER);
    
    for (const videoId of streamDirs) {
      const videoDir = path.join(OUTPUT_FOLDER, videoId);
      
      if (fs.statSync(videoDir).isDirectory()) {
        const hlsPath = path.join(videoDir, 'hls', 'playlist.m3u8');
        const dashPath = path.join(videoDir, 'dash', 'manifest.mpd');
        
        const hlsExists = fs.existsSync(hlsPath);
        const dashExists = fs.existsSync(dashPath);
        
        if (hlsExists || dashExists) {
          videos.push({
            id: videoId,
            hls_url: hlsExists ? `/stream/${videoId}/hls/playlist.m3u8` : null,
            dash_url: dashExists ? `/stream/${videoId}/dash/manifest.mpd` : null,
            player_url: `/player/${videoId}`
          });
        }
      }
    }
    
    res.json(videos);
  } catch (error) {
    console.error('Error listing videos:', error);
    res.status(500).json({ error: 'Failed to list videos' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err.message === 'File type not allowed') {
    return res.status(400).json({ error: 'File type not allowed' });
  }
  
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});