"""Bounded offline planar tracking. JSON in/out; never edits a timeline."""
import sys, json, cv2, numpy as np

def track(req):
    cap = cv2.VideoCapture(req['file'])
    fps = cap.get(cv2.CAP_PROP_FPS)
    w, h = int(cap.get(3)), int(cap.get(4))
    if fps <= 0 or w <= 0 or h <= 0: raise ValueError('Cannot decode this video')
    start, end = int(round(req['start']*fps)), int(round(req['end']*fps))
    ref = int(round(req['reference']*fps))
    if end-start > fps*15 or not start <= ref <= end: raise ValueError('Choose a visible interval of at most 15 seconds')
    scale = min(1., 960/max(w,h)); size=(int(w*scale),int(h*scale))
    cap.set(cv2.CAP_PROP_POS_FRAMES,start)
    frames=[]; colors=[]; timestamps=[]
    for i in range(start,end+1):
        ok, frame=cap.read()
        if not ok: break
        timestamp=cap.get(cv2.CAP_PROP_POS_MSEC)/1000
        if abs(timestamp-i/fps)>1/fps: raise ValueError("Variable frame timing is unsupported; prepare a constant-frame-rate source before tracking")
        timestamps.append(timestamp)
        small=cv2.resize(frame,size); colors.append(cv2.cvtColor(small,cv2.COLOR_BGR2LAB)); frames.append(cv2.cvtColor(small,cv2.COLOR_BGR2GRAY))
    cap.release()
    ri=ref-start
    if ri >= len(frames): raise ValueError('Reference frame is outside the source')
    quad=np.array(req['quad'],np.float32)*np.array(size,np.float32)
    if not cv2.isContourConvex(quad) or abs(cv2.contourArea(quad))<16: raise ValueError('Mark four corners clockwise around a visible surface')
    # Uniform surfaces can have few interior corners: follow their color boundary.
    reference_mask=np.zeros(frames[ri].shape,np.uint8); cv2.fillConvexPoly(reference_mask,np.int32(quad),255)
    reference_mask=cv2.erode(reference_mask,np.ones((7,7),np.uint8))
    pixels=colors[ri][reference_mask>0]
    if len(pixels)<16: raise ValueError("Surface is too small; choose a clearer reference frame")
    center=np.median(pixels,axis=0); spread=np.maximum(np.percentile(abs(pixels-center),90,axis=0)*2,[50,16,16])
    def boundary(image, previous):
        mask=np.uint8(np.all(abs(image.astype(float)-center)<spread,axis=2))*255
        roi=np.zeros(mask.shape,np.uint8); cv2.fillConvexPoly(roi,np.int32(previous),255)
        roi=cv2.dilate(roi,np.ones((65,65),np.uint8)); mask=cv2.bitwise_and(mask,roi)
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
        contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        candidates=[]
        for c in contours:
            hull=cv2.convexHull(c)
            approx=cv2.approxPolyDP(hull,.02*cv2.arcLength(hull,True),True)
            for epsilon in [.03,.04,.05,.06]:
                if len(approx)<=4: break
                approx=cv2.approxPolyDP(hull,epsilon*cv2.arcLength(hull,True),True)
            # Extend the four paper edges through interior shadows rather than
            # mistaking a shadow boundary for a physical corner.
            hp=hull[:,0,:].astype(float); lines=[]
            for side in range(4):
                a=previous[side]; b=previous[(side+1)%4]; direction=b-a; direction/=max(1,np.linalg.norm(direction)); choices=[]
                for j,p in enumerate(hp):
                    v=hp[(j+1)%len(hp)]-p; length=np.linalg.norm(v)
                    if length<12 or abs(np.dot(v/length,direction))<.97: continue
                    midpoint=(a+b)/2; dist=abs(v[0]*(midpoint-p)[1]-v[1]*(midpoint-p)[0])/length
                    if dist<35: choices.append((dist+20/length,p,v))
                if not choices: break
                _,p,v=min(choices,key=lambda e:e[0]); lines.append((p,v))
            q=None
            if len(lines)==4:
                corners=[]
                for j in range(4):
                    p,v=lines[(j-1)%4]; r,u=lines[j]; matrix=np.column_stack((v,-u))
                    if abs(np.linalg.det(matrix))<1e-6: break
                    corners.append(p+np.linalg.solve(matrix,r-p)[0]*v)
                if len(corners)==4: q=np.array(corners,np.float32)
            if q is None:
                if len(approx)!=4 or not cv2.isContourConvex(approx): continue
                q=approx[:,0,:].astype(np.float32)
            if not cv2.isContourConvex(q): continue
            area=abs(cv2.contourArea(q)); ratio=area/max(1,abs(cv2.contourArea(previous)))
            if not .55<ratio<1.7: continue
            # Order by cyclic correspondence; preserve the surface's orientation.
            variants=[np.roll(order,k,axis=0) for order in (q,q[::-1]) for k in range(4)]
            q=min(variants,key=lambda v:np.linalg.norm(v-previous,axis=1).mean())
            distance=np.linalg.norm(q-previous,axis=1).mean()
            if distance<40: candidates.append((distance,q))
        return min(candidates,key=lambda p:p[0])[1] if candidates else None
    samples={ri:{'t':ref/fps,'quad':req['quad'],'visible':True,'confidence':1.}}
    for direction in [-1,1]:
        prev=frames[ri]; q=quad.copy(); alive=True
        for i in range(ri+direction,len(frames) if direction==1 else -1,direction):
            current=frames[i]; confidence=0.
            if alive:
                edge_quad=boundary(colors[i],q)
                if edge_quad is not None:
                    q=edge_quad; confidence=.85
                    samples[i]={'t':(start+i)/fps,'quad':(q/np.array(size)).tolist(),'visible':True,'confidence':confidence}
                    prev=current; continue
                mask=np.zeros(prev.shape,np.uint8); cv2.fillConvexPoly(mask,np.int32(q),255)
                pts=cv2.goodFeaturesToTrack(prev,160,.005,3,mask=mask,blockSize=3)
                if pts is None or len(pts)<4: alive=False
                else:
                    nxt,status,_=cv2.calcOpticalFlowPyrLK(prev,current,pts,None,winSize=(25,25),maxLevel=3)
                    back,bs,_=cv2.calcOpticalFlowPyrLK(current,prev,nxt,None,winSize=(25,25),maxLevel=3)
                    good=(status.ravel()>0)&(bs.ravel()>0)&(np.linalg.norm(back-pts,axis=2).ravel()<1.5)
                    if sum(good)<4: alive=False
                    else:
                        H,inliers=cv2.findHomography(pts[good],nxt[good],cv2.RANSAC,2.5)
                        confidence=float(np.mean(inliers)) if inliers is not None else 0.
                        if H is None or confidence<.6: alive=False
                        else:
                            newq=cv2.perspectiveTransform(q.reshape(1,4,2),H)[0]
                            ratio=abs(cv2.contourArea(newq))/max(1,abs(cv2.contourArea(q)))
                            if not cv2.isContourConvex(newq) or not .5<ratio<2 or np.any(newq<0) or np.any(newq>np.array(size)): alive=False
                            else: q=newq
            samples[i]={'t':(start+i)/fps,'quad':(q/np.array(size)).tolist(),'visible':bool(alive),'confidence':confidence if alive else 0.}
            prev=current
    return {'width':w,'height':h,'samples':[samples[i] for i in sorted(samples)],'fps':fps}

if __name__=='__main__':
    try: print(json.dumps(track(json.load(sys.stdin)),allow_nan=False))
    except Exception as e: print(str(e),file=sys.stderr); sys.exit(1)
