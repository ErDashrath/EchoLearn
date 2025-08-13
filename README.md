# EchoLearn: Local AI-Powered Chat Platform

![Project Banner](https://placehold.co/1200x400/1E90FF/FFFFFF?text=EchoLearn%0ALocal%20AI%20Chat%20Platform)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![React](https://img.shields.io/badge/React-18.3+-61DAFB.svg)
![WebLLM](https://img.shields.io/badge/WebLLM-Enabled-purple.svg)
[![Vercel](https://img.shields.io/badge/Vercel-Ready-black.svg)](https://vercel.com)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-welcome-brightgreen.svg)](#contributing)

A modern, privacy-first chat platform that runs AI models directly in your browser. No servers, no API keys, no data collection - just pure local AI inference powered by WebLLM technology.

## 🌟 What Makes EchoLearn Special

- **🔒 100% Private:** All AI processing happens in your browser - no data leaves your device
- **🚀 Browser-Native AI:** Advanced language models running with WebGPU acceleration
- **💻 Cross-Platform:** Works on any modern browser, any device, anywhere
- **⚡ Fast & Efficient:** Optimized for performance with smart caching
- **🎨 Beautiful UI:** Modern, responsive interface inspired by ChatGPT
- **🌐 Deploy Anywhere:** Ready for Vercel, Netlify, or any static hosting

## ✨ Key Features

### 🤖 **Local AI Models**
- **Download & Manage:** Browse and download AI models directly in your browser
- **Model Activation:** Easy activate/deactivate system for switching between models
- **Smart Caching:** Efficient model storage with automatic cache management
- **Multiple Models:** Support for Llama 3.2, Phi-3, Gemma, and more

### 💬 **Advanced Chat Experience**
- **Natural Conversations:** Customizable AI personality and behavior
- **System Prompts:** Create custom AI personas and conversation styles
- **Clean Interface:** Distraction-free chat with optimized message width
- **Hidden Scrollbars:** Smooth scrolling without visual clutter
- **Responsive Design:** Perfect experience on desktop, tablet, and mobile

### 🛠️ **Developer-Friendly**
- **TypeScript:** Full type safety and excellent developer experience
- **Modern Stack:** React 18, Vite, Tailwind CSS, Framer Motion
- **Component Library:** Radix UI components with custom styling
- **Build Optimization:** Code splitting, tree shaking, and asset optimization

## 🏗️ Architecture

```
EchoLearn/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── chat/       # Chat interface components
│   │   │   ├── navigation/ # Sidebar and model selector
│   │   │   └── ui/         # Base UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # WebLLM service integration
│   │   ├── types/          # TypeScript type definitions
│   │   └── pages/          # Application pages
│   ├── public/             # Static assets
│   └── dist/               # Production build output
├── vercel.json             # Vercel deployment configuration
└── README.md
```

**Tech Stack:**
- **Frontend:** React 18.3 + TypeScript + Vite
- **Styling:** Tailwind CSS + Radix UI
- **Animations:** Framer Motion
- **AI Engine:** WebLLM (Browser-based inference)
- **Deployment:** Vercel/Netlify ready

## 🚀 Quick Start

### Option 1: Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ErDashrath/EchoLearn)

1. Click the deploy button above
2. Fork the repository to your GitHub
3. Vercel will automatically deploy your app
4. Visit your deployed URL and start chatting!

### Option 2: Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ErDashrath/EchoLearn.git
   cd EchoLearn/client
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   ```
   http://localhost:5173
   ```

## 📱 Browser Compatibility

| Browser | Support | WebGPU | Performance |
|---------|---------|--------|-------------|
| **Chrome 113+** | ✅ Full | ✅ Yes | ⭐⭐⭐⭐⭐ |
| **Edge 113+** | ✅ Full | ✅ Yes | ⭐⭐⭐⭐⭐ |
| **Firefox 110+** | ✅ Full | ⚠️ CPU Only | ⭐⭐⭐⭐ |
| **Safari 16.4+** | ✅ Full | ⚠️ CPU Only | ⭐⭐⭐⭐ |
| **Mobile Chrome** | ✅ Full | ✅ Yes | ⭐⭐⭐⭐ |
| **Mobile Safari** | ✅ Full | ⚠️ CPU Only | ⭐⭐⭐ |

## 🎯 How to Use

### 1. **Download a Model**
- Open the sidebar (hamburger menu)
- Browse available AI models
- Click "Download" on your preferred model
- Wait for download to complete

### 2. **Activate Model**
- Click "Activate" next to your downloaded model
- The model will appear in the top-right navbar
- You're ready to start chatting!

### 3. **Customize AI Behavior**
- Click the gear icon in the chat input
- Toggle "Use Custom Prompt"
- Write your own AI personality
- Save & Apply for instant changes

### 4. **Start Conversations**
- Type your message in the chat input
- AI responses are generated locally
- No internet required after model download!

## 🔧 Available Models

| Model | Size | Speed | Quality | Best For |
|-------|------|--------|---------|----------|
| **Llama 3.2 1B** | 1.2GB | ⚡⚡⚡ | ⭐⭐⭐ | Quick responses, mobile |
| **Llama 3.2 3B** | 2.0GB | ⚡⚡ | ⭐⭐⭐⭐ | Balanced performance |
| **Phi-3 Mini** | 2.2GB | ⚡⚡ | ⭐⭐⭐⭐ | Efficient reasoning |

## 🎨 Features Showcase

### **Smart Model Management**
- Download models directly in browser
- Activate/deactivate with one click
- Visual indicators for active models
- Efficient caching system

### **Natural Conversations**
- Customizable AI personalities
- No restrictive prompts by default
- System prompt manager for advanced users
- Conversational and engaging responses

### **Optimized UI/UX**
- Chat boxes with perfect width
- Hidden scrollbars with full functionality
- Smooth animations and transitions
- Responsive design for all devices

## 🚀 Deployment

### Vercel (Recommended)
The project is pre-configured for Vercel deployment:

```json
{
  "buildCommand": "cd client && npm ci && npm run build",
  "outputDirectory": "client/dist",
  "installCommand": "cd client && npm ci"
}
```

### Other Platforms
- **Netlify:** Deploy the `client/dist` folder
- **GitHub Pages:** Build and deploy static assets
- **Cloudflare Pages:** Connect your repository for automatic deployments

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build

# Quality
npm run type-check   # TypeScript type checking
npm run lint         # ESLint checking
```

### Project Scripts
```bash
# Install dependencies
npm install

# Start development
npm run dev

# Build for production
npm run build

# Preview build
npm run preview
```

## 🎯 Customization

### **System Prompts Examples**

**Casual Friend:**
```
You are a casual and friendly AI who loves to chat about anything. Be curious, ask follow-up questions, and share interesting facts or perspectives.
```

**Creative Assistant:**
```
You're a creative and imaginative AI who loves brainstorming ideas, writing, and artistic discussions. Be enthusiastic and inspiring.
```

**Technical Expert:**
```
Act as a knowledgeable technical expert who can explain complex topics clearly. Ask clarifying questions and provide detailed explanations.
```

## � Privacy & Security

- **No Data Collection:** Everything runs locally in your browser
- **No API Keys:** No external AI services required
- **No Server Dependency:** Works completely offline after initial setup
- **Cross-Origin Headers:** Properly configured for security
- **Local Storage:** Models and data stored only on your device

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Commit your changes:** `git commit -m 'Add amazing feature'`
5. **Push to the branch:** `git push origin feature/amazing-feature`
6. **Open a Pull Request**

### Development Guidelines

- Use TypeScript for all new code
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

## 📊 Performance

- **Initial Load:** ~2-3 seconds
- **Model Download:** 1-5 minutes (one-time)
- **Response Time:** 1-3 seconds (depending on model)
- **Memory Usage:** 2-8GB (depending on model)
- **Storage:** Models cached locally for instant reuse

## 🐛 Troubleshooting

### **Model Won't Download**
- Check browser compatibility (WebGPU support)
- Ensure sufficient storage space
- Try a smaller model first

### **Slow Performance**
- Enable WebGPU in browser settings
- Close other tabs to free memory
- Try a smaller model

### **Chat Not Working**
- Activate a model first
- Check browser console for errors
- Refresh the page

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **WebLLM Team** for browser-based AI inference
- **Radix UI** for accessible component primitives
- **Tailwind CSS** for utility-first styling
- **Framer Motion** for beautiful animations

---

<div align="center">

**Built with ❤️ by [Dashrath](https://github.com/ErDashrath)**

[⭐ Star this repo](https://github.com/ErDashrath/EchoLearn) | [🐛 Report Bug](https://github.com/ErDashrath/EchoLearn/issues) | [💡 Request Feature](https://github.com/ErDashrath/EchoLearn/issues)

</div>
