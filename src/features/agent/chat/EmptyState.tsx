import { ArrowUpRight, ImagePlus, Sparkles } from "lucide-react";
import type { PromptPreset } from "../../../engine/ai/prompts";
import type { AgentMode } from "@shared/protocol";

export function EmptyState({
  projectName,
  suggestions,
  onUse,
  onModeChange,
}: {
  projectName: string;
  suggestions: PromptPreset[];
  onUse: (preset: PromptPreset) => void;
  onModeChange: (mode: AgentMode) => void;
}) {
  return (
    <div className="chat-empty">
      <div className="chat-empty-mark"><Sparkles size={20} /></div>
      <div className="chat-empty-copy">
        <h3>What should we make in {projectName}?</h3>
        <p>Ask about the project, plan a change, or drop in a sprite or sound and tell me how it should fit.</p>
      </div>
      <div className="chat-suggestion-grid">
        {suggestions.slice(0, 4).map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="chat-suggestion-card"
            onClick={() => { onModeChange(preset.mode); onUse(preset); }}
          >
            <span>{preset.description}</span>
            <strong>{preset.label}</strong>
            <ArrowUpRight size={13} />
          </button>
        ))}
      </div>
      <div className="chat-empty-attach">
        <ImagePlus size={14} />
        <span>Drop an image or audio file here to add it to your game.</span>
      </div>
    </div>
  );
}
