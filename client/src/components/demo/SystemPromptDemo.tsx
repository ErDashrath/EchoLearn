import { useState } from "react";
import { SystemPromptManager } from "@/components/chat/SystemPromptManager";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SystemPromptDemo() {
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [isCustomActive, setIsCustomActive] = useState(false);

  const handlePromptChange = (prompt: string, isEnabled: boolean) => {
    setCurrentPrompt(prompt);
    setIsCustomActive(isEnabled);
    console.log("System prompt updated:", { prompt, isEnabled });
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">System Prompt Manager</h2>
        <p className="text-sm text-muted-foreground">
          Demo of the custom system prompt component
        </p>
      </div>

      <SystemPromptManager 
        onPromptChange={handlePromptChange}
        className="w-full"
      />

      {/* Status Display */}
      <Card className="p-4 bg-muted/30">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          Current Status
          {isCustomActive && (
            <Badge variant="default" className="text-xs">
              Custom Active
            </Badge>
          )}
        </h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Mode:</strong> {isCustomActive ? "Custom Prompt" : "Default Prompt"}</p>
          <p><strong>Length:</strong> {currentPrompt.length} characters</p>
        </div>
      </Card>
    </div>
  );
}