/**
 * PdfSplitterService - Split large PDFs into smaller documents
 *
 * Splits PDFs by:
 * - Page count (e.g., every 20 pages)
 * - File size target (e.g., ~5MB per split)
 * - Custom page ranges
 *
 * Uses pdf-lib for pure JavaScript PDF manipulation (no external dependencies)
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');

// Default settings
const DEFAULT_PAGES_PER_SPLIT = 20;
const DEFAULT_TARGET_SIZE_MB = 10;
const SPLIT_OUTPUT_DIR = path.join(__dirname, '../../data/uploads/splits');

// Ensure split output directory exists
if (!fs.existsSync(SPLIT_OUTPUT_DIR)) {
  fs.mkdirSync(SPLIT_OUTPUT_DIR, { recursive: true });
}

class PdfSplitterService {
  constructor() {
    this.outputDir = SPLIT_OUTPUT_DIR;
  }

  /**
   * Get PDF info (page count, file size)
   *
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<{pageCount: number, fileSize: number, avgPageSize: number}>}
   */
  async getPdfInfo(pdfPath) {
    const stats = fs.statSync(pdfPath);
    const fileSize = stats.size;

    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    return {
      pageCount,
      fileSize,
      fileSizeMB: fileSize / (1024 * 1024),
      avgPageSize: pageCount > 0 ? fileSize / pageCount : 0,
      avgPageSizeMB: pageCount > 0 ? (fileSize / pageCount) / (1024 * 1024) : 0
    };
  }

  /**
   * Calculate optimal split ranges based on target size or page count
   *
   * @param {object} pdfInfo - PDF info from getPdfInfo()
   * @param {object} options - Split options
   * @returns {Array<{start: number, end: number, partNumber: number}>}
   */
  calculateSplitRanges(pdfInfo, options = {}) {
    const {
      pagesPerSplit = DEFAULT_PAGES_PER_SPLIT,
      targetSizeMB = null,
      customRanges = null
    } = options;

    // If custom ranges provided, use them
    if (customRanges && Array.isArray(customRanges)) {
      return customRanges.map((range, idx) => ({
        start: range.start,
        end: Math.min(range.end, pdfInfo.pageCount),
        partNumber: idx + 1
      }));
    }

    // Calculate pages per split based on target size
    let effectivePagesPerSplit = pagesPerSplit;

    if (targetSizeMB && pdfInfo.avgPageSizeMB > 0) {
      // Calculate how many pages to achieve target size
      effectivePagesPerSplit = Math.max(1, Math.floor(targetSizeMB / pdfInfo.avgPageSizeMB));
    }

    // Generate ranges
    const ranges = [];
    let partNumber = 1;

    for (let start = 0; start < pdfInfo.pageCount; start += effectivePagesPerSplit) {
      const end = Math.min(start + effectivePagesPerSplit, pdfInfo.pageCount);
      ranges.push({ start, end, partNumber });
      partNumber++;
    }

    return ranges;
  }

  /**
   * Split a PDF into multiple smaller PDFs
   *
   * @param {string} pdfPath - Path to source PDF
   * @param {object} options - Split options
   * @param {number} options.pagesPerSplit - Pages per split (default: 20)
   * @param {number} options.targetSizeMB - Target size per split in MB (overrides pagesPerSplit)
   * @param {Array} options.customRanges - Custom page ranges [{start, end}, ...]
   * @param {string} options.outputDir - Output directory (default: data/uploads/splits)
   * @param {string} options.baseFileName - Base name for output files (default: original name)
   * @param {function} options.onProgress - Progress callback (partNumber, totalParts)
   * @returns {Promise<{success: boolean, parts: Array<{path, partNumber, pageRange, size}>}>}
   */
  async split(pdfPath, options = {}) {
    const startTime = Date.now();
    const {
      pagesPerSplit = DEFAULT_PAGES_PER_SPLIT,
      targetSizeMB = null,
      customRanges = null,
      outputDir = this.outputDir,
      baseFileName = null,
      onProgress = null
    } = options;

    // Verify source exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Get PDF info
    const pdfInfo = await this.getPdfInfo(pdfPath);

    // If PDF is small enough, no split needed
    const minSizeForSplit = (targetSizeMB || DEFAULT_TARGET_SIZE_MB) * 1024 * 1024;
    if (pdfInfo.fileSize <= minSizeForSplit && pdfInfo.pageCount <= pagesPerSplit) {
      logger.info(`PDF is small enough (${pdfInfo.fileSizeMB.toFixed(2)}MB, ${pdfInfo.pageCount} pages) - no split needed`);
      return {
        success: true,
        splitRequired: false,
        original: {
          path: pdfPath,
          pageCount: pdfInfo.pageCount,
          fileSize: pdfInfo.fileSize
        },
        parts: []
      };
    }

    // Calculate split ranges
    const ranges = this.calculateSplitRanges(pdfInfo, { pagesPerSplit, targetSizeMB, customRanges });

    logger.info(`Splitting PDF (${pdfInfo.fileSizeMB.toFixed(2)}MB, ${pdfInfo.pageCount} pages) into ${ranges.length} parts`);

    // Load source PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate base name
    const originalName = baseFileName || path.basename(pdfPath, '.pdf');
    const splitId = uuidv4().slice(0, 8);

    const parts = [];

    // Create each split
    for (const range of ranges) {
      const { start, end, partNumber } = range;
      const partPadded = String(partNumber).padStart(2, '0');

      // Create new PDF with pages from range
      const newDoc = await PDFDocument.create();

      // Copy pages from source
      const pageIndices = [];
      for (let i = start; i < end; i++) {
        pageIndices.push(i);
      }

      const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
      for (const page of copiedPages) {
        newDoc.addPage(page);
      }

      // Copy metadata from source
      try {
        const srcMeta = srcDoc.getTitle();
        if (srcMeta) {
          newDoc.setTitle(`${srcMeta} - Part ${partNumber}`);
        }
        newDoc.setCreator('SwarmAI PDF Splitter');
        newDoc.setProducer('pdf-lib');
      } catch {
        // Ignore metadata errors
      }

      // Save split PDF
      const splitFileName = `${originalName}_${splitId}_part${partPadded}.pdf`;
      const splitPath = path.join(outputDir, splitFileName);

      const splitBytes = await newDoc.save();
      fs.writeFileSync(splitPath, splitBytes);

      const splitSize = fs.statSync(splitPath).size;

      parts.push({
        path: splitPath,
        fileName: splitFileName,
        partNumber,
        pageRange: { start: start + 1, end }, // 1-indexed for display
        pageCount: end - start,
        size: splitSize,
        sizeMB: splitSize / (1024 * 1024)
      });

      if (onProgress) {
        onProgress(partNumber, ranges.length);
      }

      logger.debug(`Created part ${partNumber}/${ranges.length}: pages ${start + 1}-${end} (${(splitSize / 1024 / 1024).toFixed(2)}MB)`);
    }

    const duration = Date.now() - startTime;

    logger.info(`PDF split complete: ${parts.length} parts created in ${duration}ms`);

    return {
      success: true,
      splitRequired: true,
      splitId,
      original: {
        path: pdfPath,
        fileName: path.basename(pdfPath),
        pageCount: pdfInfo.pageCount,
        fileSize: pdfInfo.fileSize,
        fileSizeMB: pdfInfo.fileSizeMB
      },
      parts,
      totalParts: parts.length,
      duration
    };
  }

  /**
   * Split PDF and ingest all parts into a library
   *
   * @param {string} pdfPath - Path to source PDF
   * @param {string} libraryId - Target library ID
   * @param {object} options - Options
   * @param {string} options.userId - User ID
   * @param {string} options.folderId - Target folder ID
   * @param {number} options.pagesPerSplit - Pages per split
   * @param {number} options.targetSizeMB - Target size per split
   * @param {function} options.onProgress - Progress callback
   * @returns {Promise<{success: boolean, documents: Array}>}
   */
  async splitAndIngest(pdfPath, libraryId, options = {}) {
    const {
      userId,
      folderId,
      pagesPerSplit = DEFAULT_PAGES_PER_SPLIT,
      targetSizeMB = DEFAULT_TARGET_SIZE_MB,
      onProgress = null,
      ocrLanguages = 'eng+msa+chi_sim'
    } = options;

    // Step 1: Split the PDF
    if (onProgress) onProgress('splitting', 0, 'Analyzing PDF...');

    const splitResult = await this.split(pdfPath, {
      pagesPerSplit,
      targetSizeMB,
      onProgress: (part, total) => {
        if (onProgress) {
          const progress = Math.round((part / total) * 30); // Splitting is 0-30%
          onProgress('splitting', progress, `Creating part ${part}/${total}`);
        }
      }
    });

    // If no split needed, ingest original
    if (!splitResult.splitRequired) {
      if (onProgress) onProgress('ingesting', 30, 'Ingesting document...');

      const { getRetrievalService } = require('../rag/RetrievalService.cjs');
      const retrievalService = getRetrievalService();

      // Extract text from original PDF
      const extractResult = await this.extractTextFromPdf(pdfPath, { ocrLanguages });

      const doc = await retrievalService.ingestDocument(
        {
          title: path.basename(pdfPath, '.pdf'),
          content: extractResult.text,
          sourceType: 'file_upload',
          folderId,
          metadata: {
            fileName: path.basename(pdfPath),
            fileSize: splitResult.original.fileSize,
            pageCount: splitResult.original.pageCount,
            ocrUsed: extractResult.ocrUsed
          }
        },
        libraryId,
        { userId }
      );

      if (onProgress) onProgress('complete', 100, 'Complete');

      return {
        success: true,
        splitUsed: false,
        documents: [doc]
      };
    }

    // Step 2: Ingest each part
    const documents = [];
    const totalParts = splitResult.parts.length;

    for (let i = 0; i < totalParts; i++) {
      const part = splitResult.parts[i];

      if (onProgress) {
        const progress = 30 + Math.round(((i + 1) / totalParts) * 65); // Ingesting is 30-95%
        onProgress('ingesting', progress, `Ingesting part ${i + 1}/${totalParts}`);
      }

      try {
        // Extract text from this part
        const extractResult = await this.extractTextFromPdf(part.path, { ocrLanguages });

        if (!extractResult.text || extractResult.text.trim().length === 0) {
          logger.warn(`No text extracted from part ${part.partNumber}`);
          continue;
        }

        const { getRetrievalService } = require('../rag/RetrievalService.cjs');
        const retrievalService = getRetrievalService();

        const doc = await retrievalService.ingestDocument(
          {
            title: `${splitResult.original.fileName} (Part ${part.partNumber})`,
            content: extractResult.text,
            sourceType: 'file_upload_split',
            folderId,
            metadata: {
              fileName: part.fileName,
              originalFileName: splitResult.original.fileName,
              splitId: splitResult.splitId,
              partNumber: part.partNumber,
              totalParts,
              pageRange: part.pageRange,
              pageCount: part.pageCount,
              fileSize: part.size,
              ocrUsed: extractResult.ocrUsed
            }
          },
          libraryId,
          { userId }
        );

        documents.push({
          ...doc,
          partNumber: part.partNumber,
          pageRange: part.pageRange
        });

      } finally {
        // Clean up split file
        if (fs.existsSync(part.path)) {
          fs.unlinkSync(part.path);
        }
      }
    }

    if (onProgress) onProgress('complete', 100, 'Complete');

    logger.info(`Split and ingest complete: ${documents.length}/${totalParts} parts ingested`);

    return {
      success: true,
      splitUsed: true,
      splitId: splitResult.splitId,
      originalFile: splitResult.original.fileName,
      totalParts,
      documents
    };
  }

  /**
   * Extract text from a PDF (with OCR fallback)
   * @private
   */
  async extractTextFromPdf(pdfPath, options = {}) {
    const { ocrLanguages = 'eng+msa+chi_sim' } = options;

    let extractedText = '';
    let ocrUsed = false;

    try {
      // Try pdf-parse first
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(buffer);
      extractedText = data.text;

      // Check if PDF appears to be scanned (no text or very little)
      if (!extractedText || extractedText.trim().length < 50) {
        logger.info(`PDF part appears to be scanned - attempting OCR...`);

        try {
          const { pdfOcrService } = require('../vision/PdfOcrService.cjs');
          const ocrStatus = await pdfOcrService.getStatus();

          if (ocrStatus.available) {
            const ocrResult = await pdfOcrService.extractText(pdfPath, {
              languages: ocrLanguages,
              maxPages: 50
            });

            if (ocrResult.text && ocrResult.text.trim().length > 0) {
              extractedText = ocrResult.text;
              ocrUsed = true;
            }
          }
        } catch (ocrError) {
          logger.warn(`OCR failed: ${ocrError.message}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to extract text from PDF: ${error.message}`);
      throw error;
    }

    return { text: extractedText, ocrUsed };
  }

  /**
   * Clean up old split files (called periodically)
   */
  cleanupOldSplits(maxAgeMs = 3600000) { // 1 hour default
    const now = Date.now();
    let cleaned = 0;

    try {
      const files = fs.readdirSync(this.outputDir);

      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} old split files`);
      }
    } catch (error) {
      logger.warn(`Failed to clean up split files: ${error.message}`);
    }

    return cleaned;
  }
}

// Singleton instance
const pdfSplitterService = new PdfSplitterService();

// Cleanup old splits every 30 minutes
setInterval(() => {
  pdfSplitterService.cleanupOldSplits();
}, 1800000);

module.exports = {
  PdfSplitterService,
  pdfSplitterService,
  DEFAULT_PAGES_PER_SPLIT,
  DEFAULT_TARGET_SIZE_MB
};
