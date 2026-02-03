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
}

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

const BASE_THERAPIST_PROMPT = `You are MindScribe, a compassionate AI mental health companion. Your role is to provide emotional support, active listening, and evidence-based coping strategies.

## Core Guidelines:
- Be warm, empathetic, and non-judgmental
- Use active listening techniques (reflect feelings, validate emotions)
- Ask open-ended questions to encourage expression
- Offer practical coping strategies when appropriate
- Never diagnose or replace professional help
- Recognize crisis signals and encourage professional support when needed

## Communication Style:
- Use "I hear you" and "That sounds difficult" to validate
- Avoid toxic positivity ("just think positive!")
- Acknowledge the difficulty before offering solutions
- Keep responses conversational, not clinical
- Use gentle, supportive language`;

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
    const { userName, dass21Results, sessionType = 'chat', timeOfDay } = context;
    
    let prompt = BASE_THERAPIST_PROMPT;
    
    // Add greeting context
    if (userName || timeOfDay) {
      prompt += `\n\n## User Context:`;
      if (userName) prompt += `\n- User's name: ${userName}`;
      if (timeOfDay) prompt += `\n- Time of day: ${timeOfDay}`;
    }
    
    // Add DASS-21 personalization if available
    if (dass21Results) {
      prompt += this.buildDASS21Context(dass21Results);
    } else {
      prompt += `\n\n## Note:
The user hasn't completed their mental health assessment yet. Be supportive and encourage them to complete the DASS-21 assessment when appropriate for personalized support.`;
    }
    
    // Add session-specific guidelines
    prompt += this.getSessionGuidelines(sessionType);
    
    // Add crisis response protocol
    prompt += `\n\n## Crisis Protocol:
If the user expresses thoughts of self-harm or suicide:
1. Express genuine care and concern
2. Take them seriously - never dismiss
3. Gently suggest: "It sounds like you're going through something really difficult. Have you considered talking to a crisis counselor? They're available 24/7 at 988 (Suicide & Crisis Lifeline)."
4. Stay with them in the conversation
5. Remind them that help is available and things can get better`;

    return prompt;
  }

  /**
   * Build DASS-21 context section
   */
  private buildDASS21Context(results: DASS21Results): string {
    // Validate that results has the expected structure
    if (!results || !results.severityLevels || !results.scores) {
      return `\n\n## Note:
Unable to load personalized mental health context. Please retake the DASS-21 assessment for personalized support.`;
    }

    const { scores, severityLevels } = results;
    
    // Additional validation for nested properties
    if (!severityLevels.depression || !severityLevels.anxiety || !severityLevels.stress) {
      return `\n\n## Note:
Unable to load complete mental health context. Please retake the DASS-21 assessment for personalized support.`;
    }
    
    let context = `\n\n## User's Mental Health Context (from DASS-21 Assessment):`;
    context += `\n\nAssessment completed: ${new Date(results.completedAt).toLocaleDateString()}`;
    
    // Add severity summaries
    context += `\n\n### Current Levels:`;
    context += `\n- Depression: ${severityLevels.depression.level} (score: ${scores.depression}/42)`;
    context += `\n- Anxiety: ${severityLevels.anxiety.level} (score: ${scores.anxiety}/42)`;
    context += `\n- Stress: ${severityLevels.stress.level} (score: ${scores.stress}/42)`;
    
    // Add specific guidance based on each severity
    const depressionGuidance = SEVERITY_PROMPTS.depression[severityLevels.depression.level];
    const anxietyGuidance = SEVERITY_PROMPTS.anxiety[severityLevels.anxiety.level];
    const stressGuidance = SEVERITY_PROMPTS.stress[severityLevels.stress.level];
    
    if (depressionGuidance || anxietyGuidance || stressGuidance) {
      context += `\n\n### Personalized Approach:`;
      if (depressionGuidance) context += depressionGuidance;
      if (anxietyGuidance) context += anxietyGuidance;
      if (stressGuidance) context += stressGuidance;
    }
    
    // Add recommended coping strategies
    context += this.buildCopingStrategies(severityLevels);
    
    return context;
  }

  /**
   * Build recommended coping strategies based on severity
   */
  private buildCopingStrategies(severityLevels: DASS21Results['severityLevels']): string {
    // Validate that severityLevels has the expected structure
    if (!severityLevels || !severityLevels.depression || !severityLevels.anxiety || !severityLevels.stress) {
      return '';
    }

    const strategies: string[] = [];
    
    if (severityLevels.depression?.level !== 'Normal') {
      strategies.push(...COPING_STRATEGIES.depression.slice(0, 2));
    }
    if (severityLevels.anxiety?.level !== 'Normal') {
      strategies.push(...COPING_STRATEGIES.anxiety.slice(0, 2));
    }
    if (severityLevels.stress?.level !== 'Normal') {
      strategies.push(...COPING_STRATEGIES.stress.slice(0, 2));
    }
    
    if (strategies.length > 0) {
      return `\n\n### Recommended Coping Strategies to Suggest:
${strategies.map(s => `- ${s}`).join('\n')}`;
    }
    
    return '';
  }

  /**
   * Get session-specific guidelines
   */
  private getSessionGuidelines(sessionType: 'chat' | 'journal' | 'voice'): string {
    const guidelines: Record<string, string> = {
      chat: `\n\n## Chat Session Guidelines:
- Keep responses concise but warm (2-4 paragraphs max)
- Use natural conversation flow
- Mix emotional support with practical suggestions
- End messages with an open question or gentle prompt`,
      
      journal: `\n\n## Journal Reflection Guidelines:
- Help the user explore and process their written thoughts
- Ask reflective questions about patterns or feelings
- Celebrate self-awareness and expression
- Suggest journaling prompts when appropriate`,
      
      voice: `\n\n## Voice Session Guidelines:
- Keep responses shorter for spoken delivery
- Use a warm, conversational tone
- Include pauses for reflection
- Speak directly and compassionately`
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
    
    if (dass21Results && dass21Results.severityLevels) {
      const hasElevated = 
        dass21Results.severityLevels.depression?.level !== 'Normal' ||
        dass21Results.severityLevels.anxiety?.level !== 'Normal' ||
        dass21Results.severityLevels.stress?.level !== 'Normal';
      
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
