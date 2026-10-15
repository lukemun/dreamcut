import { syncEffectCreatorDocs } from '../src/lib/effects/creator-docs';
syncEffectCreatorDocs(process.argv.includes('--write'));
console.log('Effect creator pages and README index are synchronized.');
