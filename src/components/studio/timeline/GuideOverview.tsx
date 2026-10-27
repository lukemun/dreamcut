import { ArrowRight, BookOpen, Clapperboard, LayoutList, Library, PanelsTopLeft, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

export function GuideOverview({ projectId, onShowEffects, onShowSkills }: { projectId: string; onShowEffects: () => void; onShowSkills: () => void }) {
  const examples = useRef<HTMLDivElement>(null);
  function play(active: HTMLVideoElement) { examples.current?.querySelectorAll("video").forEach(video => { if (video !== active) video.pause(); }); }
  return <div className="guide-overview">
    <div className="guide-overview-intro">
      <p className="memory-eyebrow">Start here</p>
      <h2>Make a video with DreamCut.</h2>
      <p>Bring your media, describe the edit you want, shape the first cut, and review the result. This guide shows where each part of the workspace fits.</p>
    </div>
    <section className="guide-overview-section guide-overview-spaces" aria-labelledby="guide-spaces-title">
      <p className="memory-eyebrow">The workspace</p>
      <h3 id="guide-spaces-title">Five places you will use</h3>
      <div className="guide-overview-space-grid">
        <Link href={`/p/${projectId}/library`} className="guide-overview-space"><Library size={20} aria-hidden="true" /><strong>Library</strong><span>Your project’s clips, images, music, and sounds. Add media here and see what is ready to edit.</span><span className="guide-overview-space-link">Open Library <ArrowRight size={14} aria-hidden="true" /></span></Link>
        <Link href={`/p/${projectId}/storyboard`} className="guide-overview-space"><LayoutList size={20} aria-hidden="true" /><strong>Storyboard</strong><span>Lay out the story shot by shot from your media, then turn it into an edit to review.</span><span className="guide-overview-space-link">Open Storyboard <ArrowRight size={14} aria-hidden="true" /></span></Link>
        <Link href={`/p/${projectId}`} className="guide-overview-space"><PanelsTopLeft size={20} aria-hidden="true" /><strong>Editor</strong><span>Play the cut, work on the timeline, and review proposed changes before they affect your edit.</span><span className="guide-overview-space-link">Open Editor <ArrowRight size={14} aria-hidden="true" /></span></Link>
        <div className="guide-overview-space"><BookOpen size={20} aria-hidden="true" /><strong>Guide</strong><span>Learn how to bring in footage, build an edit and review changes.</span><span className="guide-overview-space-link">You are here</span></div>
        <Link href={`/p/${projectId}/user`} className="guide-overview-space"><UserRound size={20} aria-hidden="true" /><strong>User</strong><span>Manage your editing preferences, personal and catalog skills, and settings.</span><span className="guide-overview-space-link">Open User <ArrowRight size={14} aria-hidden="true" /></span></Link>
      </div>
    </section>

    <section className="guide-overview-section" aria-labelledby="guide-how-title">
      <p className="memory-eyebrow">A first project</p>
      <h3 id="guide-how-title">From your media to one video</h3>
      <p className="guide-overview-section-intro">Tell Codex or Claude what you want in ordinary language. The assistant can use the editing skills behind the scenes; you stay in control of the result.</p>
      <ol className="guide-overview-steps">
        <li><span className="guide-step-number" aria-hidden="true">1</span><div><strong>Describe the video.</strong><span>Say what it is for, who it is for, its format, and what matters most. For example: “Make a short video from these clips. Keep the main point clear, add captions, and give me a first cut to review.”</span></div></li>
        <li><span className="guide-step-number" aria-hidden="true">2</span><div><strong>Add your media.</strong><span>Bring in your footage, photos, voice, and music. <a href="/api/guide/skills/media-intake" target="_blank" rel="noreferrer">Media intake</a> keeps the originals, prepares previews, and describes what is available; importing alone does not put anything in the edit.</span></div></li>
        <li><span className="guide-step-number" aria-hidden="true">3</span><div><strong>Build the first cut.</strong><span>Ask Codex or Claude to use <a href="/api/guide/skills/editorial-assembly" target="_blank" rel="noreferrer">editorial assembly</a> to choose and order the material around your goal. The assistant can call on specialist skills for captions, timing, music, and visuals as needed.</span></div></li>
        <li><span className="guide-step-number" aria-hidden="true">4</span><div><strong>Watch and refine.</strong><span>Play the result in the Editor. Ask for specific changes in plain language, or browse Templates for effects and looks, or User for editing skills for an example you can adapt. On a working edit, your assistant presents changes for your review.</span></div></li>
        <li><span className="guide-step-number" aria-hidden="true">5</span><div><strong>Finish and carry it forward.</strong><span>Approve the changes you want, request an export when the video is ready, and open Edit history in the editor for decisions and export reviews. Save reusable preferences in User → My style.</span></div></li>
      </ol>
    </section>

    <section className="guide-overview-section" aria-labelledby="guide-explore-title">
      <p className="memory-eyebrow">When you need a specific method</p>
      <h3 id="guide-explore-title">Explore DreamCut</h3>
      <div className="guide-overview-paths" aria-label="Browse the guide">
        <section className="guide-overview-path"><BookOpen size={20} aria-hidden="true" /><div><h4>Editing skills</h4><p>Find a job such as captions, pacing, audio, or assembly. See when to use the skill and what it produces.</p></div><button type="button" onClick={onShowSkills}>Browse skills <ArrowRight size={15} aria-hidden="true" /></button></section>
        <section className="guide-overview-path"><Clapperboard size={20} aria-hidden="true" /><div><h4>Templates</h4><p>Watch a result, see the footage it needs, then select it and ask your agent to make it with your own media.</p></div><button type="button" onClick={onShowEffects}>Browse templates <ArrowRight size={15} aria-hidden="true" /></button></section>
      </div>
    </section>

    <section className="guide-overview-section guide-overview-contribute" aria-labelledby="guide-contribute-title">
      <div className="guide-overview-contribute-heading">
        <Sparkles size={20} aria-hidden="true" />
        <div>
          <p className="memory-eyebrow">Contribute a method</p>
          <h3 id="guide-contribute-title">Turn an effect into a reusable skill</h3>
        </div>
      </div>
      <p>Built a look you want to use again? Start with the reference or finished result, the inputs you used, and a fresh recreation using different material. Ask Codex or Claude to capture the repeatable steps as a DreamCut skill, including the required inputs, adjustable options, and a way to judge the result.</p>
      <div ref={examples} className="guide-overview-examples" aria-label="Effect reference and recreation">
        <figure className="guide-overview-example-card">
          <video controls playsInline preload="metadata" poster="/guide/effects/celfstudies-food-reference.jpg" src="/guide/effects/celfstudies-food-reference-silent.mp4" aria-label="Play the silent @celfstudies food-plate reference" onPlay={event => play(event.currentTarget)} />
          <figcaption><span>01 · Reference</span><strong>Food plates enter the scene</strong><p>The original short clip shows the objects arriving before the scene changes.</p><a href="https://www.instagram.com/reel/DdN_aljAIY0/" target="_blank" rel="noreferrer">Original by @celfstudies ↗</a></figcaption>
        </figure>
        <figure className="guide-overview-example-card">
          <video controls playsInline preload="metadata" poster="/guide/effects/pop-small-birds.jpg" src="/guide/effects/pop-small-birds.mp4" aria-label="Play the DreamCut bird recreation" onPlay={event => play(event.currentTarget)} />
          <figcaption><span>02 · Recreation</span><strong>The same idea, with birds</strong><p>Birds pop in over a different scene, then flash white. This version uses batched entrances instead of matching every floating path.</p><button type="button" onClick={onShowEffects}>See this template <ArrowRight size={14} aria-hidden="true" /></button></figcaption>
        </figure>
      </div>
      <p>The reusable sequence lives in the <a href="/api/guide/skills/pop-in-white-flash" target="_blank" rel="noreferrer">pop-in-white-flash skill</a>: provide two scenes, separate objects, their entrance order, and the flash timing. The bird example is a <strong>partial recreation</strong>; matching the reference’s floating motion and checking it on fresh footage are still open.</p>
      <p>You can follow the same path with an effect you made: save the reference and inputs, recreate it with different material, then capture the method as a skill. A shared contribution includes the result, skill, and evidence of what works or still needs improvement. <a href="https://github.com/lukemun/DreamCut/blob/main/CONTRIBUTING.md#contributing-an-effect" target="_blank" rel="noreferrer">Read how to contribute an effect</a>.</p>
      <p className="guide-overview-style-note">Your personal taste belongs in <strong>User → My style</strong>; shared templates and skills describe methods other people can reuse.</p>
    </section>
  </div>;
}
