import { Suspense } from "react";
import { WorkspaceChromeProvider } from "./WorkspaceChrome";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { OpenProjectReporter } from "./OpenProjectReporter";
import { listProjectIds, projectTimelinePath } from "@/lib/local-store/paths";
import { readProjectListMetadata } from "@/lib/local-store/project-list-metadata";
import fs from "node:fs";
import type { Metadata } from "next";

import "./globals.css";
import "./editor-glass.css";
import "./editor-workspace.css";
import { EditorAppearanceProvider } from "./EditorAppearance";
import { EDITOR_TEXT_SIZE_BOOT_SCRIPT } from "./editor-text-size";
import { Toaster } from "@/components/ui/sonner";
import { timelineFontVariablesClassName, timelineFontVariablesStyle } from "@/lib/fonts/next-fonts";

export const metadata: Metadata = {
  title: "DreamCut",
  description: "The editor for dreamers. Local, agent-native video editing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-editor-theme="dark" data-editor-text-size="standard" data-editor-palette="chrome" className={`${timelineFontVariablesClassName} dark`} style={timelineFontVariablesStyle}>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem("dreamcut.appearance"),l=p===null?(localStorage.getItem("openedit.appearance")??localStorage.getItem("opensequence.appearance")):null;if(p===null&&l!==null){p=l;localStorage.setItem("dreamcut.appearance",l)}var dark=(p!=="light"&&p!=="system")||p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.editorTheme=dark?"dark":"light";var palette=localStorage.getItem("dreamcut.palette")??localStorage.getItem("openedit.palette");if(palette==="aurora"||palette==="chrome")document.documentElement.dataset.editorPalette=palette;document.documentElement.classList.toggle("dark",dark)}catch(e){}})()` }} />
        <script dangerouslySetInnerHTML={{ __html: EDITOR_TEXT_SIZE_BOOT_SCRIPT }} />
        <EditorAppearanceProvider>
          <WorkspaceChromeProvider>
          <Suspense><WorkspaceTabs projects={listProjectIds().filter(id => fs.existsSync(projectTimelinePath(id))).map(id => ({ id, title: readProjectListMetadata(id).title }))}/><OpenProjectReporter/></Suspense>
          {children}
          </WorkspaceChromeProvider>
          <Toaster />
        </EditorAppearanceProvider>
      </body>
    </html>
  );
}
