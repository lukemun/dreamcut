import type {TimelineTransitionParams} from '../../components/studio/timeline/types';
import {resolveTransitionDirection,resolvePageTurnOrigin,resolvePageTurnTransitionVisualStyle,resolvePageTurnCurl} from './transitions';

/** Shared deterministic page geometry. Resource readiness and face drawing belong
 * to the renderer. Preserve segmented still pages versus rigid video pages. */
export function pageTurnVisualPlan(progress:number,params:TimelineTransitionParams|null|undefined,outgoingType:string,width:number,height:number){
  const direction = resolveTransitionDirection(params);
  const pageTurnOrigin = resolvePageTurnOrigin(params);
  const turnsFromBottomRight = pageTurnOrigin === "bottom-right";
  const effectiveDirection = turnsFromBottomRight ? "from-right" : direction;
  const pageTurn = resolvePageTurnTransitionVisualStyle(progress, "out", effectiveDirection);
  const isVertical = effectiveDirection === "from-top" || effectiveDirection === "from-bottom";
  const usesSegmentedCurl = !isVertical && outgoingType === "still";
  const hingeIsLeft = effectiveDirection === "from-right";
  const curlSegmentCount = turnsFromBottomRight ? 28 : 36;
  const curlSegmentWidth = width / curlSegmentCount;
  const diagonalBleed = turnsFromBottomRight ? curlSegmentWidth * 0.7 : 0;
  const curlStrength = resolvePageTurnCurl(params);
  const pageLift = Math.sin(progress * Math.PI);
  const curlAmplitudeDeg = pageLift
    * (turnsFromBottomRight ? 110 : 85)
    * curlStrength;
  const curlSegments = usesSegmentedCurl
    ? Array.from({ length: curlSegmentCount }, (_, index) => {
      const distanceFromHinge = curlSegmentCount <= 1 ? 0 : index / (curlSegmentCount - 1);
      // Smoothstep has zero slope at both page edges and its steepest slope
      // through the middle third. That makes the sheet look bowed through its
      // body instead of folded sharply at the loose edge.
      const middleWeightedCurl = distanceFromHinge * distanceFromHinge
        * (3 - 2 * distanceFromHinge);
      const baseRotationDeg = Math.abs(pageTurn.rotateYDeg);
      const rotationMagnitudeDeg = Math.min(
        175,
        baseRotationDeg + curlAmplitudeDeg * middleWeightedCurl,
      );
      const rotationDeg = (hingeIsLeft ? -1 : 1) * rotationMagnitudeDeg;
      const cornerWeight = turnsFromBottomRight ? middleWeightedCurl : 0;
      const panelY = -pageLift * height * 0.16 * cornerWeight;
      const tiltXDeg = -pageLift * 22 * cornerWeight;
      return { index, panelY, rotationDeg, tiltXDeg };
    })
    : [];
  let curlChainX = hingeIsLeft ? 0 : width;
  let curlChainZ = 0;
  const positionedCurlSegments = curlSegments.map(({ index, panelY, rotationDeg, tiltXDeg }) => {
    const radians = rotationDeg * Math.PI / 180;
    const cropX = hingeIsLeft
      ? index * curlSegmentWidth
      : width - (index + 1) * curlSegmentWidth;
    const panelX = hingeIsLeft ? curlChainX : curlChainX - curlSegmentWidth;
    const panelZ = curlChainZ;
    if (hingeIsLeft) {
      curlChainX += curlSegmentWidth * Math.cos(radians);
      curlChainZ -= curlSegmentWidth * Math.sin(radians);
    } else {
      curlChainX -= curlSegmentWidth * Math.cos(radians);
      curlChainZ += curlSegmentWidth * Math.sin(radians);
    }
    const panelWidth = curlSegmentWidth + diagonalBleed * 2;
    const topRightPercent = (curlSegmentWidth / panelWidth) * 100;
    const bottomLeftPercent = ((diagonalBleed * 2) / panelWidth) * 100;
    return {
      clipPath: turnsFromBottomRight
        ? `polygon(0 0, ${topRightPercent}% 0, 100% 100%, ${bottomLeftPercent}% 100%)`
        : undefined,
      contentCropX: cropX - diagonalBleed,
      index,
      panelWidth,
      panelX: panelX - diagonalBleed,
      panelY,
      panelZ,
      rotationDeg,
      tiltXDeg,
      transformOrigin: turnsFromBottomRight
        ? `${diagonalBleed * 2}px 100%`
        : (hingeIsLeft ? "left center" : "right center"),
    };
  });

  const frontShade = turnsFromBottomRight
    ? "linear-gradient(225deg, transparent 0%, rgba(0,0,0,0.08) 52%, rgba(0,0,0,0.72) 100%)"
    : effectiveDirection === "from-right"
    ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.72) 100%)"
    : effectiveDirection === "from-left"
      ? "linear-gradient(270deg, transparent 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.72) 100%)"
      : effectiveDirection === "from-top"
        ? "linear-gradient(0deg, transparent 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.72) 100%)"
        : "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.72) 100%)";
  const castShadow = turnsFromBottomRight
    ? "linear-gradient(225deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.2) 16%, transparent 38%)"
    : effectiveDirection === "from-right"
    ? "linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.2) 13%, transparent 34%)"
    : effectiveDirection === "from-left"
      ? "linear-gradient(270deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.2) 13%, transparent 34%)"
      : effectiveDirection === "from-top"
        ? "linear-gradient(0deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.2) 13%, transparent 34%)"
        : "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.2) 13%, transparent 34%)";
  const backShade = effectiveDirection === "from-right" || effectiveDirection === "from-bottom"
    ? "linear-gradient(90deg, #f1ece4 0%, #d4cdc2 72%, #aaa196 100%)"
    : "linear-gradient(270deg, #f1ece4 0%, #d4cdc2 72%, #aaa196 100%)";
  const turnTransform = `translateZ(${Math.sin(progress * Math.PI) * 8}px) rotateX(${pageTurn.rotateXDeg}deg) rotateY(${pageTurn.rotateYDeg}deg)`;
  const backFaceTransform = isVertical
    ? "rotateX(180deg) translateZ(0.5px)"
    : "rotateY(180deg) translateZ(0.5px)";

  return {direction,pageTurnOrigin,turnsFromBottomRight,effectiveDirection,pageTurn,isVertical,usesSegmentedCurl,hingeIsLeft,curlSegmentCount,curlSegmentWidth,diagonalBleed,curlStrength,pageLift,curlAmplitudeDeg,positionedCurlSegments,frontShade,castShadow,backShade,turnTransform,backFaceTransform};
}
