/**
 * Generate PNG icons from SVG for PWA manifest
 * Run with: node scripts/generate-icons.cjs
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

// Icon sizes required by manifest.webmanifest and index.html
const sizes = [72, 96, 120, 128, 144, 152, 180, 192, 384, 512];

// Shortcut icons
const shortcutIcons = [
  { name: 'shortcut-messages', size: 96 },
  { name: 'shortcut-dashboard', size: 96 },
  { name: 'shortcut-flows', size: 96 }
];

// Splash screen sizes (optional, for iOS)
const splashSizes = [
  { width: 640, height: 1136, name: 'splash-640x1136' },
  { width: 750, height: 1334, name: 'splash-750x1334' },
  { width: 1125, height: 2436, name: 'splash-1125x2436' },
  { width: 1242, height: 2208, name: 'splash-1242x2208' }
];

async function generateIcons() {
  console.log('Generating PWA icons from SVG...\n');

  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // Read SVG file
  const svgBuffer = fs.readFileSync(svgPath);

  // Generate standard icons
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}.png`);
    try {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Created: icon-${size}.png`);
    } catch (err) {
      console.error(`Failed to create icon-${size}.png:`, err.message);
    }
  }

  // Generate shortcut icons (same icon, different names for now)
  for (const shortcut of shortcutIcons) {
    const outputPath = path.join(iconsDir, `${shortcut.name}.png`);
    try {
      await sharp(svgBuffer)
        .resize(shortcut.size, shortcut.size)
        .png()
        .toFile(outputPath);
      console.log(`Created: ${shortcut.name}.png`);
    } catch (err) {
      console.error(`Failed to create ${shortcut.name}.png:`, err.message);
    }
  }

  // Generate splash screens
  console.log('\nGenerating splash screens...');
  for (const splash of splashSizes) {
    const outputPath = path.join(iconsDir, `${splash.name}.png`);
    try {
      // Create splash screen with centered icon on dark background
      const iconSize = Math.min(splash.width, splash.height) * 0.3;
      const iconBuffer = await sharp(svgBuffer)
        .resize(Math.round(iconSize), Math.round(iconSize))
        .toBuffer();

      await sharp({
        create: {
          width: splash.width,
          height: splash.height,
          channels: 4,
          background: { r: 15, g: 23, b: 42, alpha: 1 } // #0f172a
        }
      })
        .composite([{
          input: iconBuffer,
          gravity: 'center'
        }])
        .png()
        .toFile(outputPath);
      console.log(`Created: ${splash.name}.png`);
    } catch (err) {
      console.error(`Failed to create ${splash.name}.png:`, err.message);
    }
  }

  // Copy SVG as favicon.svg to public root
  const faviconSvgPath = path.join(__dirname, '..', 'public', 'favicon.svg');
  if (!fs.existsSync(faviconSvgPath)) {
    fs.copyFileSync(svgPath, faviconSvgPath);
    console.log('\nCopied: favicon.svg to public/');
  }

  console.log('\nIcon generation complete!');
}

generateIcons().catch(console.error);
