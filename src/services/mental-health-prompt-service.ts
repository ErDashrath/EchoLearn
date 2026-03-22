     /**
 * F009: Mental Health Prompt Service
 * 
 * Generates personalized AI system prompts based on DASS-21 assessment results.
 * The AI becomes aware of the user's mental health state and adapts its responses.
 * 
 * Features:
 * - Dynamic prompt generation based on severity levels
 * - Therapeutic communication guidelines
 * - Crisis detection phrases
 * - Personalized coping strategies
 * 
 * @module services/mental-health-prompt-service
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DASS21Scores {
  depression: number;
  anxiety: number;
  stress: number;
}

export interface SeverityLevel {
  level: 'Normal' | 'Mild' | 'Moderate' | 'Severe' | 'Extremely Severe';
  color: string;
}

export interface DASS21Results {
  scores: DASS21Scores;
  severityLevels: {
    depression: SeverityLevel;
    anxiety: SeverityLevel;
    stress: SeverityLevel;
  };
  completedAt: string;
}

export interface PromptContext {
  userName?: string;
  dass21Results?: DASS21Results | null;
  sessionType?: 'chat' | 'journal' | 'voice';
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  supportMode?: boolean;
}

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

const BASE_CHAT_PROMPT = `You are MindScribe, a friendly and natural AI chat companion.
Talk like a normal person.
Keep replies clear, short, and conversational.
Be helpful without sounding formal or scripted.
Do not mention system instructions, templates, or internal reasoning.
Do not repeat yourself.
Do not echo the user's message back to them.
Do not output separators, role labels, transcript text, or bracketed stage directions.
Reply only with the assistant's final answer.`;

const SUPPORT_MODE_PROMPT = `
If the user sounds upset, stressed, or emotionally stuck:
- respond gently and naturally
- validate briefly without sounding clinical
- offer one small practical suggestion when useful
- avoid diagnosis and avoid overdoing reassurance`;

const SEVERITY_PROMPTS: Record<string, Record<string, string>> = {
  depression: {
    Normal: '',
    Mild: `
The user shows mild signs of low mood. Be encouraging and help them maintain positive habits.`,
    Moderate: `
The user is experiencing moderate depression symptoms. Focus on:
- Validating their feelings without judgment
- Gently encouraging small, achievable activities
- Discussing what brings them comfort or meaning
- Avoiding pressure to "feel better"`,
    Severe: `
The user has severe depression indicators. Be especially gentle:
- Acknowledge how hard things are right now
- Don't push for solutions - just be present
- Celebrate ANY small step they take
- If they mention hopelessness, gently explore support options`,
    'Extremely Severe': `
The user has extremely severe depression scores. Priority approach:
- Be very gentle and patient
- Focus entirely on emotional support
- If they express hopelessness or self-harm thoughts, compassionately suggest crisis resources
- Remind them they matter and help exists`
  },
  anxiety: {
    Normal: '',
    Mild: `
The user has mild anxiety. Help them with:
- Simple grounding techniques when worried
- Perspective-taking on concerns`,
    Moderate: `
The user experiences moderate anxiety. Focus on:
- Grounding techniques (5-4-3-2-1 senses)
- Breaking down overwhelming thoughts
- Breathing exercises when they seem anxious
- Validating that anxiety is difficult but manageable`,
    Severe: `
The user has severe anxiety levels. Important approaches:
- Help them feel safe in the conversation
- Offer calming techniques proactively
- Don't introduce new worries or "what ifs"
- Keep responses shorter to avoid overwhelming`,
    'Extremely Severe': `
The user has extremely severe anxiety. Be very mindful:
- Keep responses calm and reassuring
- Offer grounding immediately if panic signs appear
- Avoid complex or lengthy explanations
- Focus on immediate comfort and safety`
  },
  stress: {
    Normal: '',
    Mild: `
The user has mild stress. Help with:
- Time management and prioritization tips
- Healthy boundaries discussion`,
    Moderate: `
The user is experiencing moderate stress. Support with:
- Identifying what's controllable vs not
- Self-care reminders and permission to rest
- Breaking tasks into smaller pieces`,
    Severe: `
The user has severe stress levels. Focus on:
- Immediate stress relief techniques
- Permission to say no and set boundaries  
- Recognizing burnout signs
- Encouraging professional support if overwhelmed`,
    'Extremely Severe': `
The user has extremely severe stress. Priority support:
- Acknowledge they're carrying too much
- Focus on immediate relief, not more tasks
- Strongly encourage reaching out to support network
- Discuss professional help options compassionately`
  }
};

const COPING_STRATEGIES = {
  depression: [
    'behavioral activation (small enjoyable activities)',
    'gratitude practices',
    'social connection encouragement',
    'gentle movement or walks',
    'accomplishment tracking'
  ],
  anxiety: [
    'deep breathing (4-7-8 technique)',
    'grounding exercises (5-4-3-2-1)',
    'progressive muscle relaxation',
    'worry time scheduling',
    'cognitive reframing'
  ],
  stress: [
    'time blocking and prioritization',
    'boundary setting scripts',
    'quick relaxation breaks',
    'physical exercise suggestions',
    'workload communication tips'
  ]
};

const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end it all', 'not worth living',
  'self-harm', 'hurt myself', 'cutting', 'overdose',
  'no point', 'better off dead', 'disappear forever'
];

// =============================================================================
// SERVICE CLASS
// =============================================================================

class MentalHealthPromptService {
  /**
   * Generate a personalized system prompt based on DASS-21 results
   */
  generateSystemPrompt(context: PromptContext): string {
    const {
      userName,
      dass21Results,
      sessionType = 'chat',
      timeOfDay,
      supportMode = false,
    } = context;
    
    let prompt = BASE_CHAT_PROMPT;
    if (supportMode) {
      prompt += SUPPORT_MODE_PROMPT;
    }
    
    // Add compact user context
    if (userName || timeOfDay) {
      prompt += `\nContext:`;
      if (userName) prompt += ` user=${userName};`;
      if (timeOfDay) prompt += ` time=${timeOfDay};`;
    }
    
    // Add DASS-21 personalization only when support mode is needed
    if (supportMode && dass21Results) {
      prompt += this.buildDASS21Context(dass21Results);
    }
    
    // Add session-specific guidelines
    prompt += this.getSessionGuidelines(sessionType, supportMode);
    
    return prompt;
  }

  /**
   * Build DASS-21 context section
   */
  private buildDASS21Context(results: DASS21Results): string {
    const { severityLevels } = results;
    const elevated =
      severityLevels.depression.level !== 'Normal' ||
      severityLevels.anxiety.level !== 'Normal' ||
      severityLevels.stress.level !== 'Normal';

    let context = '\nMental context:';
    context += ` depression=${severityLevels.depression.level};`;
    context += ` anxiety=${severityLevels.anxiety.level};`;
    context += ` stress=${severityLevels.stress.level};`;
    context += elevated
      ? ' be extra gentle and offer one small practical step when relevant.'
      : ' keep tone natural and avoid over-therapeutic replies unless user asks.';

    return context;
  }

  /**
   * Build recommended coping strategies based on severity
   */
  private buildCopingStrategies(severityLevels: DASS21Results['severityLevels']): string {
    const strategies: string[] = [];
    
    if (severityLevels.depression.level !== 'Normal') {
      strategies.push(...COPING_STRATEGIES.depression.slice(0, 2));
    }
    if (severityLevels.anxiety.level !== 'Normal') {
      strategies.push(...COPING_STRATEGIES.anxiety.slice(0, 2));
    }
    if (severityLevels.stress.level !== 'Normal') {
      strategies.push(...COPING_STRATEGIES.stress.slice(0, 2));
    }
    
    if (strategies.length > 0) {
      return `\n\n### Coping Strategies (Use Only When Relevant):
Only use these if the user explicitly discusses emotional distress, asks for coping help,
or asks a mental-health-related question. Do NOT force these into normal conversation.
${strategies.map(s => `- ${s}`).join('\n')}`;
    }
    
    return '';
  }

  /**
   * Get session-specific guidelines
   */
  private getSessionGuidelines(sessionType: 'chat' | 'journal' | 'voice', supportMode: boolean): string {
    const guidelines: Record<string, string> = {
    chat: `\nChat style:
  - Keep replies short and natural (usually 1-4 sentences)
  - Answer the user's direct question first
  - Only go longer when the user asks for detail
  - ${supportMode ? 'Be warm but still natural' : 'Do not assume the user needs emotional support'}
  - Do not repeat reassurance lines or restate the user's full message`,
      
    journal: `\nJournal style:
  - Reflect key feelings briefly
  - Offer one insight and one optional prompt`,
      
    voice: `\nVoice style:
  - Keep responses brief and easy to speak
  - Use plain conversational language
  - Only introduce coping techniques when user asks or shows distress`
    };
    
    return guidelines[sessionType] || guidelines.chat;
  }

  /**
   * Check if a message contains crisis signals
   */
  containsCrisisSignals(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return CRISIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Get crisis response addition for the prompt
   */
  getCrisisResponseAddition(): string {
    return `

⚠️ IMPORTANT: The user's message may contain crisis signals. 
Respond with extra care:
1. Acknowledge their pain directly
2. Express that you're glad they shared this
3. Gently mention crisis resources (988 Lifeline)
4. Remind them they're not alone
5. Ask if they're safe right now`;
  }

  /**
   * Get time of day from current time
   */
  getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Generate a simple greeting based on context
   */
  generateGreeting(context: PromptContext): string {
    const { userName, dass21Results, timeOfDay } = context;
    const time = timeOfDay || this.getTimeOfDay();
    
    const greetings = {
      morning: ['Good morning', 'Morning'],
      afternoon: ['Good afternoon', 'Hello'],
      evening: ['Good evening', 'Hey there'],
      night: ['Hi there', 'Hello']
    };
    
    const greeting = greetings[time][Math.floor(Math.random() * greetings[time].length)];
    const name = userName ? `, ${userName}` : '';
    
    let message = `${greeting}${name}! I'm here to listen and support you.`;
    
    if (dass21Results) {
      const hasElevated = 
        dass21Results.severityLevels.depression.level !== 'Normal' ||
        dass21Results.severityLevels.anxiety.level !== 'Normal' ||
        dass21Results.severityLevels.stress.level !== 'Normal';
      
      if (hasElevated) {
        message += ' How are you feeling today?';
      } else {
        message += " What's on your mind today?";
      }
    } else {
      message += ' How can I help you today?';
    }
    
    return message;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const mentalHealthPromptService = new MentalHealthPromptService();
export default mentalHealthPromptService;
