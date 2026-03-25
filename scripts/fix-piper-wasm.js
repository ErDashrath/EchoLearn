/**
 * Post-install script to fix piper-wasm missing expressions.js file
 * 
 * The piper-wasm package has a broken import in api.js that references
 * ./expressions.js which doesn't exist. This script creates the missing file.
 * 
 * Run automatically after npm install via the "postinstall" script in package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to piper-wasm in node_modules
const piperWasmPath = path.join(__dirname, '..', 'node_modules', 'piper-wasm');
const expressionsPath = path.join(piperWasmPath, 'expressions.js');
const piperWorkerSrcPath = path.join(piperWasmPath, 'piper_worker.js');
const publicPiperDir = path.join(__dirname, '..', 'public', 'wasm', 'piper');
const piperWorkerDestPath = path.join(publicPiperDir, 'piper_worker.js');

// Content for the missing expressions.js file
// This provides a minimal Expressions class that the api.js file imports
const expressionsContent = `/**
 * Auto-generated expressions.js to fix piper-wasm import error
 * Created by EchoLearn postinstall script
 */

export class Expressions {
  constructor() {
    this.expressions = {};
  }

  async init() {
    // No-op - expressions are optional
    return this;
  }

  async infer(audioData) {
    // Return empty expression data
    return {
      expressions: [],
      emotions: []
    };
  }

  dispose() {
    // Cleanup
  }
}

export default Expressions;
`;

function fixPiperWasm() {
  console.log('🔧 Fixing piper-wasm missing expressions.js...');
  
  // Check if piper-wasm is installed
  if (!fs.existsSync(piperWasmPath)) {
    console.log('⚠️  piper-wasm not found in node_modules, skipping fix');
    return;
  }
  
  // Check if expressions.js already exists
  if (fs.existsSync(expressionsPath)) {
    console.log('✅ expressions.js already exists, skipping');
  } else {
    try {
      // Create the missing expressions.js file
      fs.writeFileSync(expressionsPath, expressionsContent, 'utf8');
      console.log('✅ Created missing expressions.js in piper-wasm');
    } catch (error) {
      console.error('❌ Failed to create expressions.js:', error.message);
      process.exit(1);
    }
  }

  try {
    if (!fs.existsSync(publicPiperDir)) {
      fs.mkdirSync(publicPiperDir, { recursive: true });
    }

    if (fs.existsSync(piperWorkerSrcPath)) {
      fs.copyFileSync(piperWorkerSrcPath, piperWorkerDestPath);
      console.log('✅ Copied piper_worker.js to public/wasm/piper');
    } else {
      console.log('⚠️  piper_worker.js not found in piper-wasm package');
    }
  } catch (error) {
    console.error('❌ Failed to publish piper_worker.js:', error.message);
    process.exit(1);
  }
}

// Run the fix
fixPiperWasm();
