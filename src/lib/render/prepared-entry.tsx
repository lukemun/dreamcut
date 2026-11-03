// Mount the exact owned render surface without Next development/HMR code.
import {createRoot} from 'react-dom/client';
import RenderFrame from '../../app/render-frame/page';
createRoot(document.getElementById('root')!).render(<RenderFrame />);
