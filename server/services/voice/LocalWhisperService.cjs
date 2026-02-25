/**
 * LocalWhisperService - Local voice transcription using Whisper CLI
 *
 * Provides audio transcription using locally installed Whisper:
 * - whisper.cpp (C++ implementation, fast)
 * - faster-whisper (Python implementation, accurate)
 *
 * Mirrors VisionAnalysisService.cjs (Tesseract OCR) architecture.
 * Requires ffmpeg for audio format conversion (OGG/Opus → WAV).
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { logger } = require('../logger.cjs');

// Supported Whisper models (smallest to largest)
const WHISPER_MODELS = {
  'tiny': 'Fastest, least accurate (~1GB VRAM)',
  'base': 'Fast, decent accuracy (~1GB VRAM)',
  'small': 'Balanced speed/accuracy (~2GB VRAM)',
  'medium': 'Good accuracy (~5GB VRAM)',
  'large': 'Best accuracy (~10GB VRAM)',
  'large-v3': 'Latest, best accuracy (~10GB VRAM)',
};

// ISO 639-1 language codes supported by Whisper
const SUPPORTED_LANGUAGES = {
  'auto': 'Auto-detect',
  'en': 'English',
  'ms': 'Malay',
  'zh': 'Chinese',
  'ta': 'Tamil',
  'hi': 'Hindi',
  'id': 'Indonesian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'th': 'Thai',
  'vi': 'Vietnamese',
  'ar': 'Arabic',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'it': 'Italian',
  'nl': 'Dutch',
  'tr': 'Turkish',
};

class LocalWhisperService {
  constructor() {
    this.whisperAvailable = null;
    this.whisperVersion = null;
    this.whisperType = null; // 'whisper.cpp' | 'faster-whisper' | 'openai-whisper'
    this.whisperCommand = null;
    this.ffmpegAvailable = null;
  }

  /**
   * Check if a Whisper CLI is available
   * Priority: whisper (whisper.cpp main) > faster-whisper > whisper (OpenAI Python)
   */
  async checkWhisperAvailable() {
    if (this.whisperAvailable !== null) {
      return this.whisperAvailable;
    }

    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? 'where' : 'which';

    // Try whisper.cpp main binary first
    const candidates = [
      { cmd: 'whisper-cpp', type: 'whisper.cpp' },
      { cmd: 'main', type: 'whisper.cpp' },      // whisper.cpp default binary name
      { cmd: 'faster-whisper', type: 'faster-whisper' },
      { cmd: 'whisper', type: 'openai-whisper' }, // OpenAI's Python whisper
    ];

    for (const candidate of candidates) {
      try {
        execSync(`${checkCmd} ${candidate.cmd}`, { encoding: 'utf8', stdio: 'pipe' });

        // Try to get version
        let version = 'unknown';
        try {
          if (candidate.type === 'openai-whisper' || candidate.type === 'faster-whisper') {
            version = execSync(`${candidate.cmd} --version 2>&1`, { encoding: 'utf8', stdio: 'pipe' }).trim();
          } else {
            version = execSync(`${candidate.cmd} --help 2>&1`, { encoding: 'utf8', stdio: 'pipe' }).split('\n')[0];
          }
        } catch {
          // Version check is optional
        }

        this.whisperAvailable = true;
        this.whisperVersion = version;
        this.whisperType = candidate.type;
        this.whisperCommand = candidate.cmd;
        logger.info(`Whisper available: ${candidate.type} (${candidate.cmd}) - ${version}`);
        return true;
      } catch {
        // Not found, try next
      }
    }

    this.whisperAvailable = false;
    logger.warn('No Whisper CLI found in PATH. Local voice transcription disabled.');
    return false;
  }

  /**
   * Check if ffmpeg is available (needed for audio format conversion)
   */
  async checkFfmpegAvailable() {
    if (this.ffmpegAvailable !== null) {
      return this.ffmpegAvailable;
    }

    try {
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? 'where ffmpeg' : 'which ffmpeg';
      execSync(checkCmd, { encoding: 'utf8', stdio: 'pipe' });
      this.ffmpegAvailable = true;
      logger.info('FFmpeg available for audio conversion');
      return true;
    } catch {
      this.ffmpegAvailable = false;
      logger.warn('FFmpeg not found. Audio format conversion disabled.');
      return false;
    }
  }

  /**
   * Convert audio file to WAV 16kHz mono (Whisper's preferred format)
   *
   * @param {string} inputPath - Path to input audio file (OGG, MP3, etc.)
   * @param {number} timeout - Timeout in ms (default: 30000)
   * @returns {Promise<string>} Path to converted WAV file (temp file, caller must clean up)
   */
  async convertToWav(inputPath, timeout = 30000) {
    const ffmpegAvailable = await this.checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      throw new Error('FFmpeg not available for audio conversion');
    }

    const tempDir = os.tmpdir();
    const randomName = crypto.randomBytes(16).toString('hex');
    const wavPath = path.join(tempDir, `whisper-${randomName}.wav`);

    return new Promise((resolve, reject) => {
      // Convert to 16kHz mono WAV (Whisper's preferred format)
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ar', '16000',    // 16kHz sample rate
        '-ac', '1',        // Mono
        '-c:a', 'pcm_s16le', // 16-bit PCM
        '-y',              // Overwrite output
        wavPath,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      const timeoutId = setTimeout(() => {
        ffmpeg.kill('SIGTERM');
        reject(new Error(`FFmpeg conversion timeout after ${timeout}ms`));
      }, timeout);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });

      ffmpeg.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code !== 0) {
          reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-200)}`));
          return;
        }
        if (!fs.existsSync(wavPath)) {
          reject(new Error('FFmpeg produced no output file'));
          return;
        }
        resolve(wavPath);
      });

      ffmpeg.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Transcribe an audio file using local Whisper CLI
   *
   * @param {string} audioPath - Path to audio file
   * @param {object} options
   * @param {string} options.language - Language code (default: 'auto')
   * @param {string} options.model - Whisper model name (default: 'base')
   * @param {number} options.timeout - Timeout in ms (default: 120000)
   * @returns {Promise<{text: string, language: string, confidence: number, duration: number}>}
   */
  async transcribe(audioPath, options = {}) {
    const {
      language = 'auto',
      model = 'base',
      timeout = 120000,
    } = options;

    // Check availability
    const available = await this.checkWhisperAvailable();
    if (!available) {
      throw new Error('Whisper CLI is not available');
    }

    // Verify audio file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // Check if format needs conversion (Whisper prefers WAV)
    const ext = path.extname(audioPath).toLowerCase();
    const needsConversion = ['.ogg', '.opus', '.webm', '.m4a', '.aac', '.wma'].includes(ext);
    let processPath = audioPath;
    let tempWavPath = null;

    if (needsConversion) {
      try {
        tempWavPath = await this.convertToWav(audioPath);
        processPath = tempWavPath;
        logger.debug(`Converted ${ext} → WAV for Whisper processing`);
      } catch (convErr) {
        // If conversion fails but file is MP3/WAV, try directly
        if (['.mp3', '.wav', '.flac'].includes(ext)) {
          logger.warn(`Conversion failed but trying direct: ${convErr.message}`);
          processPath = audioPath;
        } else {
          throw new Error(`Cannot convert ${ext} audio: ${convErr.message}`);
        }
      }
    }

    try {
      const result = await this._executeWhisper(processPath, { language, model, timeout });
      return result;
    } finally {
      // Clean up temp WAV file
      if (tempWavPath && fs.existsSync(tempWavPath)) {
        try { fs.unlinkSync(tempWavPath); } catch { /* ignore cleanup errors */ }
      }
    }
  }

  /**
   * Execute the Whisper CLI and parse output
   * @private
   */
  async _executeWhisper(audioPath, { language, model, timeout }) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      // Build command args based on whisper type
      let args;
      if (this.whisperType === 'whisper.cpp') {
        args = [
          '-m', model,
          '-f', audioPath,
          '--no-timestamps',
          '--print-progress', 'false',
        ];
        if (language !== 'auto') {
          args.push('-l', language);
        }
      } else {
        // openai-whisper or faster-whisper
        args = [
          audioPath,
          '--model', model,
          '--output_format', 'txt',
          '--output_dir', os.tmpdir(),
        ];
        if (language !== 'auto') {
          args.push('--language', language);
        }
      }

      const whisperProc = spawn(this.whisperCommand, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeoutId = setTimeout(() => {
        whisperProc.kill('SIGTERM');
        reject(new Error(`Whisper transcription timeout after ${timeout}ms`));
      }, timeout);

      whisperProc.stdout.on('data', (data) => { stdout += data.toString(); });
      whisperProc.stderr.on('data', (data) => { stderr += data.toString(); });

      whisperProc.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (code !== 0 && !stdout.trim()) {
          logger.error(`Whisper failed (code ${code}): ${stderr.slice(-300)}`);
          reject(new Error(`Whisper transcription failed: ${stderr.slice(-200) || 'Unknown error'}`));
          return;
        }

        // Parse output
        let text = stdout.trim();

        // For openai-whisper/faster-whisper, output may be in a .txt file
        if (!text && (this.whisperType === 'openai-whisper' || this.whisperType === 'faster-whisper')) {
          const baseName = path.basename(audioPath, path.extname(audioPath));
          const txtPath = path.join(os.tmpdir(), `${baseName}.txt`);
          if (fs.existsSync(txtPath)) {
            text = fs.readFileSync(txtPath, 'utf8').trim();
            try { fs.unlinkSync(txtPath); } catch { /* ignore */ }
          }
        }

        // Try to detect language from stderr (Whisper logs detected language)
        let detectedLanguage = language;
        if (language === 'auto') {
          const langMatch = stderr.match(/Detected language:\s*(\w+)/i);
          if (langMatch) {
            detectedLanguage = langMatch[1].toLowerCase();
          }
        }

        const confidence = this.estimateConfidence(text);

        logger.info(`Whisper transcription completed in ${duration}ms, ${text.length} chars, language: ${detectedLanguage}`);

        resolve({
          text,
          language: detectedLanguage,
          confidence,
          duration,
          provider: 'local_whisper',
          whisperType: this.whisperType,
        });
      });

      whisperProc.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error(`Whisper process error: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Transcribe from a media URL, data URL, or file path
   *
   * @param {string} audioSource - URL, data URL (data:audio/...), or local path
   * @param {object} options - Transcription options
   * @returns {Promise<{text: string, language: string, confidence: number, duration: number}>}
   */
  async transcribeFromSource(audioSource, options = {}) {
    // Handle base64 data URLs
    if (audioSource && audioSource.startsWith('data:audio/')) {
      return this.transcribeFromBase64(audioSource, options);
    }

    // Local file path
    if (fs.existsSync(audioSource)) {
      return this.transcribe(audioSource, options);
    }

    // Check media directories
    const mediaPath = path.join(__dirname, '../../data/media');
    const possiblePaths = [
      audioSource,
      path.join(mediaPath, path.basename(audioSource)),
      path.join(mediaPath, audioSource),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return this.transcribe(p, options);
      }
    }

    throw new Error(`Audio file not found: ${audioSource}`);
  }

  /**
   * Transcribe from a base64 data URL
   */
  async transcribeFromBase64(dataUrl, options = {}) {
    let tempFilePath = null;

    try {
      const matches = dataUrl.match(/^data:audio\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid base64 audio data URL format');
      }

      const [, format, base64Data] = matches;
      const buffer = Buffer.from(base64Data, 'base64');

      const tempDir = os.tmpdir();
      const randomName = crypto.randomBytes(16).toString('hex');
      tempFilePath = path.join(tempDir, `whisper-input-${randomName}.${format}`);

      fs.writeFileSync(tempFilePath, buffer);
      return await this.transcribe(tempFilePath, options);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Estimate transcription confidence based on text quality heuristics
   */
  estimateConfidence(text) {
    if (!text || text.length === 0) return 0;

    let score = 0;
    const len = text.length;

    // Length-based scoring
    if (len > 5) score += 0.2;
    if (len > 20) score += 0.1;
    if (len > 100) score += 0.1;

    // Word count
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) score += 0.1;
    if (words.length > 5) score += 0.1;

    // Readable character ratio
    const readableRatio = (text.match(/[\w\s.,!?'"()-]/g) || []).length / len;
    score += readableRatio * 0.3;

    // Penalize repetition (common Whisper hallucination)
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const uniqueRatio = words.length > 0 ? uniqueWords.size / words.length : 0;
    if (uniqueRatio < 0.3 && words.length > 5) score -= 0.3; // Likely hallucination

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get service status and capabilities
   */
  async getStatus() {
    const whisperAvailable = await this.checkWhisperAvailable();
    const ffmpegAvailable = await this.checkFfmpegAvailable();

    return {
      available: whisperAvailable && ffmpegAvailable,
      whisperAvailable,
      ffmpegAvailable,
      version: this.whisperVersion,
      type: this.whisperType,
      command: this.whisperCommand,
      models: WHISPER_MODELS,
      supportedFormats: ['ogg', 'opus', 'wav', 'mp3', 'webm', 'm4a', 'flac', 'aac'],
      languages: SUPPORTED_LANGUAGES,
    };
  }
}

// Singleton instance
const localWhisperService = new LocalWhisperService();

module.exports = {
  LocalWhisperService,
  localWhisperService,
  WHISPER_MODELS,
  SUPPORTED_LANGUAGES,
};
