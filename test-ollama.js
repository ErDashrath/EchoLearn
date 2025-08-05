// Test script to verify Ollama connection
import { ollamaService } from '../server/services/ollama.js';

async function testOllamaConnection() {
  console.log('Testing Ollama connection...');
  
  try {
    const response = await ollamaService.generateResponse(
      "Hello, how are you?",
      [],
      "conversation",
      "fluency"
    );
    
    console.log('✅ Ollama connection successful!');
    console.log('Response:', response.content);
    console.log('Grammar suggestions:', response.grammarSuggestions);
    console.log('Feedback:', response.feedback);
  } catch (error) {
    console.log('❌ Ollama connection failed:');
    console.error(error.message);
    console.log('\nMake sure your Ollama server is running at:');
    console.log('- Primary: https://husband-criminal-differential-vitamin.trycloudflare.com');
    console.log('- Fallback: http://localhost:11434');
  }
}

testOllamaConnection();
