import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Save, HelpCircle, Settings } from "lucide-react";

interface SystemPromptManagerProps {
  defaultPrompt?: string;
  onPromptChange?: (prompt: string, isEnabled: boolean) => void;
  className?: string;
}

export function SystemPromptManager({ 
  defaultPrompt = `You are a friendly and helpful AI English tutor. Always respond with proper markdown formatting including:

## Teaching Approach
- Use **bold** for important concepts
- Use *italics* for emphasis
- Use \`inline code\` for technical terms

### Code Examples
Always provide code examples with proper syntax highlighting:

\`\`\`javascript
function improveEnglish() {
  console.log("Practice makes perfect!");
}
\`\`\`

### Learning Tips
1. **Practice daily** for best results
2. *Ask questions* when unsure
3. Use examples to understand concepts

> **Remember**: Learning English is a journey, not a destination!

Format all responses with proper markdown for better readability.`,
  onPromptChange,
  className = ""
}: SystemPromptManagerProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleChange = (enabled: boolean) => {
    setIsEnabled(enabled);
    if (!enabled) {
      onPromptChange?.(defaultPrompt, false);
    }
  };

  const handleReset = () => {
    setCustomPrompt("");
    setIsEnabled(false);
    onPromptChange?.(defaultPrompt, false);
  };

  const handleSaveAndApply = async () => {
    if (!customPrompt.trim()) return;
    
    setIsSaving(true);
    
    // Simulate save operation
    await new Promise(resolve => setTimeout(resolve, 800));
    
    onPromptChange?.(customPrompt, true);
    setIsSaving(false);
  };

  const effectivePrompt = isEnabled && customPrompt.trim() ? customPrompt : defaultPrompt;
  const isCustomActive = isEnabled && customPrompt.trim();

  return (
    <Card className={`p-4 space-y-4 border-2 transition-all duration-200 ${
      isCustomActive ? 'border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20' : 'border-border'
    } ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">System Prompt</Label>
          {isCustomActive && (
            <Badge variant="secondary" className="text-xs">
              Custom Active
            </Badge>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Settings className={`h-4 w-4 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`} />
        </Button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="space-y-4 overflow-hidden"
          >
            {/* Toggle Switch */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Label htmlFor="custom-prompt-toggle" className="text-sm">
                  Use Custom Prompt
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      System prompts define the AI's personality and behavior. 
                      Example: "Be casual and friendly" or "Act like a curious friend who asks thoughtful questions."
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              
              <Switch
                id="custom-prompt-toggle"
                checked={isEnabled}
                onCheckedChange={handleToggleChange}
                className="data-[state=checked]:bg-blue-500"
              />
            </div>

            {/* Custom Prompt Input */}
            <AnimatePresence>
              {isEnabled && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  <Label htmlFor="custom-prompt-input" className="text-sm text-muted-foreground">
                    Custom System Prompt
                  </Label>
                  <Textarea
                    id="custom-prompt-input"
                    placeholder="e.g., 'You are a casual and friendly AI who loves to chat about anything. Be curious, ask follow-up questions, and share interesting facts or perspectives.'"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="min-h-[80px] resize-none text-sm"
                    maxLength={500}
                  />
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>
                      {customPrompt.length}/500 characters
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="flex-1 h-8 text-xs"
                disabled={!isEnabled && !customPrompt}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to Default
              </Button>
              
              <Button
                size="sm"
                onClick={handleSaveAndApply}
                className="flex-1 h-8 text-xs bg-blue-500 hover:bg-blue-600"
                disabled={!isEnabled || !customPrompt.trim() || isSaving}
              >
                <Save className="h-3 w-3 mr-1" />
                {isSaving ? "Saving..." : "Save & Apply"}
              </Button>
            </div>

            {/* Current Prompt Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Current Active Prompt:
              </Label>
              <div className={`p-3 rounded-lg text-xs border transition-colors duration-200 ${
                isCustomActive 
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' 
                  : 'bg-muted/30 border-border'
              }`}>
                <p className="text-muted-foreground line-clamp-3">
                  {effectivePrompt}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}