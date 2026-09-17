uniform mat4 entryProjectionInverse;
uniform mat3 entryRotation;
uniform vec3 entryView;
uniform float entryFunnel;
uniform float entryTravel;
uniform float entryWalls;
uniform float entryDetail;
vec3 entrySky(vec2 ndc) {
  vec4 eye = entryProjectionInverse * vec4(ndc, 1.0, 1.0);
  vec3 ray = normalize(entryRotation * eye.xyz);
  return funnelSky(ray, entryView, entryFunnel, entryTravel);
}
