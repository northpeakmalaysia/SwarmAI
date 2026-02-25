/**
 * Vision Services Index
 *
 * Exports all vision-related services including OCR
 */

const { VisionAnalysisService, visionService, SUPPORTED_LANGUAGES } = require('./VisionAnalysisService.cjs');

module.exports = {
  VisionAnalysisService,
  visionService,
  SUPPORTED_LANGUAGES
};
