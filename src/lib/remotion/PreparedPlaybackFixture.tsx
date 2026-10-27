/** Hybrid-preview parity fixture; never used by the export composition. */
import {Fixture,registerFixtureGroup} from '@/lib/frame-runtime/fixtures';
import {PreparedPlaybackComposition} from '@/components/studio/timeline/PreparedPlayback';
registerFixtureGroup(()=><Fixture id="PreparedPlaybackFixture" component={PreparedPlaybackComposition} width={160} height={160} fps={30} durationInFrames={120}/>);
