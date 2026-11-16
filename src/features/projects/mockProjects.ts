export type TemplateOrigin = "platformer" | "topdown" | "puzzle" | "blank";

export interface ProjectSummary {
  id: string;
  name: string;
  template: TemplateOrigin;
  sceneCount: number;
  editedLabel: string;
  archived: boolean;
  cover: "dusk" | "puzzle" | "blank";
  lastSceneId: string;
}

export const MOCK_PROJECTS: ProjectSummary[] = [
  {
    id: "prj_neonrunner",
    name: "Neon Runner",
    template: "platformer",
    sceneCount: 4,
    editedLabel: "Edited 2m ago",
    archived: false,
    cover: "dusk",
    lastSceneId: "scn_track",
  },
  {
    id: "prj_duskrun",
    name: "Dusk Run",
    template: "platformer",
    sceneCount: 3,
    editedLabel: "Edited 18m ago",
    archived: false,
    cover: "dusk",
    lastSceneId: "scn_track",
  },
  {
    id: "prj_coinvault",
    name: "Coin Vault",
    template: "puzzle",
    sceneCount: 2,
    editedLabel: "Edited 1h ago",
    archived: false,
    cover: "puzzle",
    lastSceneId: "scn_vault",
  },
  {
    id: "prj_moonbase",
    name: "Moonbase",
    template: "topdown",
    sceneCount: 5,
    editedLabel: "Edited 3h ago",
    archived: false,
    cover: "blank",
    lastSceneId: "scn_floor",
  },
  {
    id: "prj_untitled",
    name: "Untitled project",
    template: "blank",
    sceneCount: 1,
    editedLabel: "Edited yesterday",
    archived: false,
    cover: "blank",
    lastSceneId: "scn_scene",
  },
  {
    id: "prj_oldtrack",
    name: "Old Track",
    template: "platformer",
    sceneCount: 2,
    editedLabel: "Edited 12 days ago",
    archived: true,
    cover: "dusk",
    lastSceneId: "scn_track",
  },
];

export const TEMPLATE_LABELS: Record<TemplateOrigin, string> = {
  platformer: "Platformer",
  topdown: "Top-down",
  puzzle: "Puzzle",
  blank: "Blank",
};
