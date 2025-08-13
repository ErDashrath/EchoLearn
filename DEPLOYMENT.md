# EchoLearn - AI English Tutor

A modern React application built with TypeScript, Vite, and WebLLM for running AI language models locally in the browser.

## 🚀 Features

- **Local AI Models**: Run language models directly in your browser using WebLLM
- **Private & Secure**: All conversations stay in your browser - no data sent to external servers
- **Model Management**: Download, activate, and manage multiple AI models
- **Real-time Chat**: Interactive chat interface with typing indicators
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Clean, dark theme with smooth animations

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Framer Motion
- **AI**: WebLLM for local model execution
- **State Management**: React Query, Custom hooks
- **Routing**: Wouter
- **UI Components**: Radix UI, Lucide Icons

## 📦 Deployment

### Vercel (Recommended)

1. **Connect your GitHub repository** to Vercel
2. **Configure build settings**:
   - Framework Preset: `Vite`
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Environment Variables** (if needed):
   ```
   VITE_API_URL=your-api-url-here
   ```

4. **Deploy**: Vercel will automatically deploy on every push to main branch

### Manual Build

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Build for production
npm run build

# The built files will be in the 'dist' directory
```

## 🔧 Local Development

```bash
# Clone the repository
git clone <your-repo-url>
cd EchoLearn

# Navigate to client directory
cd client

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173 in your browser
```

## 📱 Browser Compatibility

- **Chrome/Edge**: Full support including WebGPU for accelerated AI inference
- **Firefox**: Supported with CPU-based inference
- **Safari**: Supported with CPU-based inference

**Note**: For best performance, use Chrome or Edge with WebGPU support enabled.

## 🔒 Privacy & Security

- All AI model inference runs locally in your browser
- No chat data is sent to external servers
- Models are downloaded and cached locally using IndexedDB
- Your conversations remain completely private

## 🤖 Supported Models

- Llama 3.2 1B (Lightweight, fast responses)
- Llama 3.2 3B (Balanced performance and quality)
- Phi-3 Mini (Microsoft's efficient model)
- And more...

## 🐛 Troubleshooting

### Model Not Loading
- Ensure you have sufficient RAM (at least 4GB available)
- Check browser console for WebGPU/WebAssembly errors
- Try refreshing the page if model appears stuck

### WebGPU Issues
- Ensure WebGPU is enabled in your browser
- Chrome: `chrome://flags/#enable-unsafe-webgpu`
- Edge: `edge://flags/#enable-unsafe-webgpu`

### Build Issues
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Ensure Node.js version is 18 or higher
- Check that all dependencies are properly installed

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

If you encounter any issues:
1. Check the browser console for errors
2. Ensure your browser supports WebAssembly and WebGPU
3. Try clearing browser cache and local storage
4. Open an issue on GitHub with detailed error information
