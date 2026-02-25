/**
 * PdfOcrService - OCR for scanned/image-based PDFs
 *
 * Converts PDF pages to images and extracts text using Tesseract OCR.
 * Uses pdf-poppler for PDF to image conversion.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { logger } = require('../logger.cjs');
const { visionService, SUPPORTED_LANGUAGES } = require('./VisionAnalysisService.cjs');

// Default settings
const DEFAULT_DPI = 200; // Good balance of quality vs speed
const MAX_PAGES = 50; // Limit pages to prevent timeout
const PAGE_TIMEOUT = 60000; // 60 seconds per page

class PdfOcrService {
  constructor() {
    this.popplerAvailable = null;
    this.popplerPath = null;
  }

  /**
   * Check if poppler (pdftoppm) is available
   */
  async checkPopplerAvailable() {
    if (this.popplerAvailable !== null) {
      return this.popplerAvailable;
    }

    try {
      const isWindows = process.platform === 'win32';

      if (isWindows) {
        // On Windows, check common install paths
        const possiblePaths = [
          'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
          'C:\\Program Files (x86)\\poppler\\Library\\bin\\pdftoppm.exe',
          'C:\\poppler\\bin\\pdftoppm.exe',
          path.join(process.env.LOCALAPPDATA || '', 'poppler', 'Library', 'bin', 'pdftoppm.exe'),
        ];

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            this.popplerPath = p;
            this.popplerAvailable = true;
            logger.info(`PDF OCR: Found poppler at ${p}`);
            return true;
          }
        }

        // Try running pdftoppm from PATH
        try {
          execSync('where pdftoppm', { encoding: 'utf8', stdio: 'pipe' });
          this.popplerPath = 'pdftoppm';
          this.popplerAvailable = true;
          logger.info('PDF OCR: Found pdftoppm in PATH');
          return true;
        } catch {
          // Not in PATH
        }
      } else {
        // Unix - check PATH
        try {
          execSync('which pdftoppm', { encoding: 'utf8', stdio: 'pipe' });
          this.popplerPath = 'pdftoppm';
          this.popplerAvailable = true;
          logger.info('PDF OCR: pdftoppm available');
          return true;
        } catch {
          // Not available
        }
      }

      this.popplerAvailable = false;
      logger.warn('PDF OCR: poppler/pdftoppm not found. Scanned PDF OCR disabled.');
      logger.warn('Install: apt-get install poppler-utils (Linux) or choco install poppler (Windows)');
      return false;
    } catch (error) {
      this.popplerAvailable = false;
      logger.warn(`PDF OCR: Failed to check poppler: ${error.message}`);
      return false;
    }
  }

  /**
   * Get PDF page count using pdfinfo
   */
  async getPageCount(pdfPath) {
    try {
      const isWindows = process.platform === 'win32';
      const pdfinfoPath = this.popplerPath?.replace('pdftoppm', 'pdfinfo') || 'pdfinfo';

      const output = execSync(`"${pdfinfoPath}" "${pdfPath}"`, {
        encoding: 'utf8',
        timeout: 10000
      });

      const match = output.match(/Pages:\s+(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch (error) {
      logger.warn(`PDF OCR: Failed to get page count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Convert a PDF page to image using pdftoppm
   */
  async convertPageToImage(pdfPath, pageNum, outputDir, dpi = DEFAULT_DPI) {
    return new Promise((resolve, reject) => {
      const outputPrefix = path.join(outputDir, `page-${pageNum}`);

      const args = [
        '-f', String(pageNum),
        '-l', String(pageNum),
        '-r', String(dpi),
        '-png',
        pdfPath,
        outputPrefix
      ];

      const pdftoppm = spawn(this.popplerPath, args);

      let stderr = '';
      const timeout = setTimeout(() => {
        pdftoppm.kill('SIGTERM');
        reject(new Error(`PDF to image conversion timeout for page ${pageNum}`));
      }, PAGE_TIMEOUT);

      pdftoppm.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pdftoppm.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`pdftoppm failed with code ${code}: ${stderr}`));
          return;
        }

        // pdftoppm creates files like page-1-1.png (prefix-page-suffix.png)
        const possibleFiles = [
          `${outputPrefix}-${pageNum}.png`,
          `${outputPrefix}.png`,
          `${outputPrefix}-1.png`
        ];

        for (const file of possibleFiles) {
          if (fs.existsSync(file)) {
            resolve(file);
            return;
          }
        }

        // Try to find any matching file
        const files = fs.readdirSync(outputDir).filter(f => f.startsWith(`page-${pageNum}`) && f.endsWith('.png'));
        if (files.length > 0) {
          resolve(path.join(outputDir, files[0]));
          return;
        }

        reject(new Error(`No output image found for page ${pageNum}`));
      });

      pdftoppm.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Extract text from a scanned PDF using OCR
   *
   * @param {string} pdfPath - Path to the PDF file
   * @param {object} options - OCR options
   * @param {string} options.languages - OCR language codes (e.g., 'eng+msa+chi_sim')
   * @param {number} options.dpi - DPI for image conversion (default: 200)
   * @param {number} options.maxPages - Maximum pages to process (default: 50)
   * @param {function} options.onProgress - Progress callback (pageNum, totalPages, pageText)
   * @returns {Promise<{text: string, pages: number, confidence: number, duration: number}>}
   */
  async extractText(pdfPath, options = {}) {
    const {
      languages = 'eng+msa+chi_sim',
      dpi = DEFAULT_DPI,
      maxPages = MAX_PAGES,
      onProgress = null
    } = options;

    const startTime = Date.now();

    // Check dependencies
    const popplerOk = await this.checkPopplerAvailable();
    if (!popplerOk) {
      throw new Error('PDF OCR requires poppler-utils. Install: apt-get install poppler-utils');
    }

    const tesseractOk = await visionService.checkTesseractAvailable();
    if (!tesseractOk) {
      throw new Error('PDF OCR requires Tesseract. Install: apt-get install tesseract-ocr');
    }

    // Verify PDF exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Get page count
    let pageCount = await this.getPageCount(pdfPath);
    if (pageCount === 0) {
      // Fallback: try processing anyway
      pageCount = maxPages;
    }

    const pagesToProcess = Math.min(pageCount, maxPages);
    logger.info(`PDF OCR: Processing ${pagesToProcess} pages from ${path.basename(pdfPath)}`);

    // Create temp directory for images
    const tempDir = path.join(os.tmpdir(), `pdf-ocr-${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const pageTexts = [];
      let totalConfidence = 0;
      let successfulPages = 0;

      for (let page = 1; page <= pagesToProcess; page++) {
        try {
          // Convert page to image
          const imagePath = await this.convertPageToImage(pdfPath, page, tempDir, dpi);

          // Extract text using Tesseract
          const result = await visionService.extractText(imagePath, { languages });

          if (result.text && result.text.trim().length > 0) {
            pageTexts.push({
              page,
              text: result.text.trim(),
              confidence: result.confidence
            });
            totalConfidence += result.confidence;
            successfulPages++;
          }

          // Clean up image immediately to save space
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }

          // Progress callback
          if (onProgress) {
            onProgress(page, pagesToProcess, result.text);
          }

          logger.debug(`PDF OCR: Page ${page}/${pagesToProcess} - ${result.text?.length || 0} chars`);
        } catch (pageError) {
          logger.warn(`PDF OCR: Failed to process page ${page}: ${pageError.message}`);
          // Continue with other pages
        }
      }

      const duration = Date.now() - startTime;

      if (pageTexts.length === 0) {
        throw new Error('Could not extract any text from PDF pages');
      }

      // Combine page texts
      const fullText = pageTexts
        .map(p => `--- Page ${p.page} ---\n${p.text}`)
        .join('\n\n');

      const avgConfidence = successfulPages > 0 ? totalConfidence / successfulPages : 0;

      logger.info(`PDF OCR: Extracted ${fullText.length} chars from ${successfulPages}/${pagesToProcess} pages in ${duration}ms`);

      return {
        text: fullText,
        pages: successfulPages,
        totalPages: pageCount,
        confidence: avgConfidence,
        duration,
        pageDetails: pageTexts
      };

    } finally {
      // Clean up temp directory
      try {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file));
        }
        fs.rmdirSync(tempDir);
      } catch (cleanupError) {
        logger.warn(`PDF OCR: Failed to clean up temp dir: ${cleanupError.message}`);
      }
    }
  }

  /**
   * Check if a PDF appears to be scanned (image-based)
   * by checking if text extraction returns very little content
   *
   * @param {string} pdfPath - Path to PDF
   * @param {string} extractedText - Text already extracted by pdf-parse
   * @returns {boolean} True if PDF appears to be scanned
   */
  isProbablyScanned(pdfPath, extractedText) {
    if (!extractedText || extractedText.trim().length === 0) {
      return true;
    }

    // If extracted text is very short relative to file size, likely scanned
    try {
      const stats = fs.statSync(pdfPath);
      const fileSizeKB = stats.size / 1024;
      const textLength = extractedText.trim().length;

      // Heuristic: normal PDFs have ~50-200 chars per KB
      // Scanned PDFs with OCR layer might have very little text
      const charsPerKB = textLength / fileSizeKB;

      if (charsPerKB < 5) {
        logger.debug(`PDF appears scanned: ${charsPerKB.toFixed(2)} chars/KB`);
        return true;
      }
    } catch {
      // Ignore stat errors
    }

    return false;
  }

  /**
   * Get service status
   */
  async getStatus() {
    const popplerOk = await this.checkPopplerAvailable();
    const tesseractStatus = await visionService.getStatus();

    return {
      available: popplerOk && tesseractStatus.available,
      poppler: {
        available: popplerOk,
        path: this.popplerPath
      },
      tesseract: tesseractStatus,
      maxPages: MAX_PAGES,
      defaultDpi: DEFAULT_DPI
    };
  }
}

// Singleton instance
const pdfOcrService = new PdfOcrService();

module.exports = {
  PdfOcrService,
  pdfOcrService
};
