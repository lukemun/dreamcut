/** Backdrop-dependent media blend modes. Inputs and outputs are premultiplied
 * sRGB, matching CSS mix-blend-mode in the opaque editor composition. */
export const GPU_BLEND_SHADER=/* wgsl */`
@group(0) @binding(0) var<uniform> mode:vec4f;
@group(0) @binding(1) var backdrop:texture_2d<f32>;
@group(0) @binding(2) var actor:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
 return vec4f(p[i],0,1);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
 let at=vec2i(p.xy);let d=textureLoad(backdrop,at,0);let s=textureLoad(actor,at,0);
 let cb=d.rgb/max(d.a,0.000001);let cs=s.rgb/max(s.a,0.000001);
 let blended=select(abs(cb-cs),cb+cs-2.0*cb*cs,mode.x==2.0);
 let rgb=(1.0-s.a)*d.rgb+(1.0-d.a)*s.rgb+s.a*d.a*blended;
 return vec4f(rgb,s.a+d.a*(1.0-s.a));
}`;
