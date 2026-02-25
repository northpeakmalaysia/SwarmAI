/**
 * VisionAnalysisService - OCR and image analysis using Tesseract
 *
 * Provides text extraction from images using pre-installed Tesseract OCR.
 * Supports multiple languages: English, Malay, Chinese (Simplified/Traditional), Tamil, Hindi
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { logger } = require('../logger.cjs');

// Supported OCR languages (pre-installed in Docker)
const SUPPORTED_LANGUAGES = {
  'eng': 'English',
  'msa': 'Malay',
  'chi_sim': 'Chinese (Simplified)',
  'chi_tra': 'Chinese (Traditional)',
  'tam': 'Tamil',
  'hin': 'Hindi'
};

// Default language chain for OCR (tries multiple languages)
const DEFAULT_LANG_CHAIN = 'eng+msa+chi_sim';

class VisionAnalysisService {
  constructor() {
    this.tesseractAvailable = null;
    this.tesseractVersion = null;
  }

  /**
   * Check if Tesseract is available
   */
  async checkTesseractAvailable() {
    if (this.tesseractAvailable !== null) {
      return this.tesseractAvailable;
    }

    try {
      // Windows uses 'where', Unix uses 'which'
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? 'where tesseract' : 'which tesseract';

      try {
        execSync(checkCmd, { encoding: 'utf8', stdio: 'pipe' });
      } catch {
        // Tesseract not in PATH
        this.tesseractAvailable = false;
        logger.warn('Tesseract OCR not found in PATH. OCR features disabled.');
        return false;
      }

      const version = execSync('tesseract --version 2>&1', { encoding: 'utf8' });
      this.tesseractVersion = version.split('\n')[0];
      this.tesseractAvailable = true;
      logger.info(`Tesseract OCR available: ${this.tesseractVersion}`);
      return true;
    } catch (error) {
      this.tesseractAvailable = false;
      logger.warn('Tesseract OCR not available:', error.message);
      return false;
    }
  }

  /**
   * Get list of available OCR languages
   */
  getAvailableLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * Extract text from an image using Tesseract OCR
   *
   * @param {string} imagePath - Path to the image file
   * @param {object} options - OCR options
   * @param {string} options.languages - Language codes (e.g., 'eng+msa+chi_sim')
   * @param {number} options.timeout - Timeout in ms (default: 30000)
   * @returns {Promise<{text: string, confidence: number, language: string}>}
   */
  async extractText(imagePath, options = {}) {
    const {
      languages = DEFAULT_LANG_CHAIN,
      timeout = 30000
    } = options;

    // Check Tesseract availability
    const available = await this.checkTesseractAvailable();
    if (!available) {
      throw new Error('Tesseract OCR is not available');
    }

    // Verify image exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      // Run tesseract: tesseract <image> stdout -l <languages>
      const tesseract = spawn('tesseract', [
        imagePath,
        'stdout',
        '-l', languages,
        '--psm', '3',  // Automatic page segmentation
        '--oem', '3'   // Default OCR Engine Mode (LSTM + Legacy)
      ]);

      const timeoutId = setTimeout(() => {
        tesseract.kill('SIGTERM');
        reject(new Error(`OCR timeout after ${timeout}ms`));
      }, timeout);

      tesseract.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      tesseract.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      tesseract.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (code !== 0) {
          logger.error(`Tesseract OCR failed with code ${code}: ${stderr}`);
          reject(new Error(`OCR failed: ${stderr || 'Unknown error'}`));
          return;
        }

        // Clean up extracted text
        const extractedText = stdout.trim();

        // Calculate rough confidence based on text quality
        const confidence = this.estimateConfidence(extractedText);

        logger.info(`OCR completed in ${duration}ms, extracted ${extractedText.length} chars, confidence: ${confidence}`);

        resolve({
          text: extractedText,
          confidence,
          language: languages,
          duration
        });
      });

      tesseract.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error(`Tesseract process error: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Extract text from an image URL (downloads first)
   *
   * @param {string} imageUrl - URL, base64 data URL, or local path to the image
   * @param {object} options - OCR options
   * @returns {Promise<{text: string, confidence: number, language: string}>}
   */
  async extractTextFromUrl(imageUrl, options = {}) {
    // Handle base64 data URLs (e.g., data:image/jpeg;base64,...)
    if (imageUrl && imageUrl.startsWith('data:image/')) {
      return this.extractTextFromBase64(imageUrl, options);
    }

    // If it's already a local path, use directly
    if (fs.existsSync(imageUrl)) {
      return this.extractText(imageUrl, options);
    }

    // If it's a relative path in the uploads/media folder
    const uploadsPath = path.join(__dirname, '../../data/uploads');
    const mediaPath = path.join(__dirname, '../../data/media');

    // Check common media directories
    const possiblePaths = [
      imageUrl,
      path.join(uploadsPath, path.basename(imageUrl)),
      path.join(mediaPath, path.basename(imageUrl)),
      path.join(uploadsPath, imageUrl),
      path.join(mediaPath, imageUrl)
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return this.extractText(p, options);
      }
    }

    throw new Error(`Image not found: ${imageUrl}`);
  }

  /**
   * Extract text from a base64 data URL
   *
   * @param {string} dataUrl - Base64 data URL (e.g., data:image/jpeg;base64,...)
   * @param {object} options - OCR options
   * @returns {Promise<{text: string, confidence: number, language: string}>}
   */
  async extractTextFromBase64(dataUrl, options = {}) {
    let tempFilePath = null;

    try {
      // Parse the data URL
      const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid base64 data URL format');
      }

      const [, format, base64Data] = matches;
      const buffer = Buffer.from(base64Data, 'base64');

      // Create temp file
      const tempDir = os.tmpdir();
      const randomName = crypto.randomBytes(16).toString('hex');
      tempFilePath = path.join(tempDir, `ocr-${randomName}.${format}`);

      // Write buffer to temp file
      fs.writeFileSync(tempFilePath, buffer);

      // Extract text
      const result = await this.extractText(tempFilePath, options);

      return result;
    } catch (error) {
      logger.error(`Failed to extract text from base64: ${error.message}`);
      throw error;
    } finally {
      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          logger.warn(`Failed to clean up temp file ${tempFilePath}: ${cleanupError.message}`);
        }
      }
    }
  }

  /**
   * Analyze an image-only message and extract text
   *
   * @param {object} message - Message object with mediaUrl
   * @param {object} options - Analysis options
   * @returns {Promise<{extractedText: string, confidence: number, shouldUpdate: boolean}>}
   */
  async analyzeImageMessage(message, options = {}) {
    const { minConfidence = 0.3 } = options;

    // Get the media URL or local path
    const imagePath = message.mediaUrl || message.mediaLocalPath;

    if (!imagePath) {
      return { extractedText: null, confidence: 0, shouldUpdate: false };
    }

    try {
      const result = await this.extractTextFromUrl(imagePath, options);

      // Only suggest update if meaningful text was extracted
      const hasContent = result.text && result.text.length > 5;
      const highEnoughConfidence = result.confidence >= minConfidence;

      return {
        extractedText: result.text,
        confidence: result.confidence,
        language: result.language,
        duration: result.duration,
        shouldUpdate: hasContent && highEnoughConfidence
      };
    } catch (error) {
      logger.error(`Failed to analyze image message: ${error.message}`);
      return {
        extractedText: null,
        confidence: 0,
        shouldUpdate: false,
        error: error.message
      };
    }
  }

  /**
   * Estimate OCR confidence based on text quality heuristics
   */
  estimateConfidence(text) {
    if (!text || text.length === 0) return 0;

    let score = 0;
    const len = text.length;

    // Length-based scoring
    if (len > 10) score += 0.2;
    if (len > 50) score += 0.1;
    if (len > 100) score += 0.1;

    // Word count
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 2) score += 0.1;
    if (words.length > 10) score += 0.1;

    // Check for readable patterns
    const alphanumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / len;
    score += alphanumericRatio * 0.3;

    // Penalize excessive special characters (noise)
    const specialRatio = (text.match(/[^\w\s.,!?-]/g) || []).length / len;
    score -= specialRatio * 0.2;

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get service status and capabilities
   */
  async getStatus() {
    const available = await this.checkTesseractAvailable();
    return {
      available,
      version: this.tesseractVersion,
      languages: SUPPORTED_LANGUAGES,
      defaultLanguageChain: DEFAULT_LANG_CHAIN
    };
  }
}

// Singleton instance
const visionService = new VisionAnalysisService();

module.exports = {
  VisionAnalysisService,
  visionService,
  SUPPORTED_LANGUAGES
};
