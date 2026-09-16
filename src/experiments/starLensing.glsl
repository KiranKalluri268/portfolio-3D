uniform vec3 lensPosition;
uniform vec3 previousEye;
uniform float lensRadius;
attribute float imageBranch;

// Finite-distance point-mass lens equation. Input is each resident star's
// actual 3D position, not an image of the background. Primary/secondary images
// retain that source identity. Weak-field approximation, not full GR near-field.
vec3 lensStar(vec3 source, vec3 eye, out float gain) {
  gain = imageBranch < 0.5 ? 1.0 : 0.0;
  if (lensRadius <= 0.0) return source;
  vec3 toLens = lensPosition - eye;
  float dl = length(toLens);
  if (dl <= lensRadius * 1.05) return source;
  vec3 axis = toLens / dl;
  vec3 toStar = source - eye;
  float ds = dot(toStar, axis);
  if (ds <= dl) return source; // foreground is never treated as background
  vec3 tangent = toStar / ds - axis;
  float beta = max(length(tangent), 0.0001);
  float weight = 1.0 - smoothstep(0.65, 1.2, beta);
  float einstein2 = 2.0 * lensRadius * (ds - dl) / (dl * ds) * weight;
  if (einstein2 < 0.0000001) return source;
  float root = sqrt(beta * beta + 4.0 * einstein2);
  float theta = imageBranch < 0.5 ? 0.5 * (beta + root) : -2.0 * einstein2 / (beta + root);
  float total = (beta * beta + 2.0 * einstein2) / (beta * root);
  gain = min(6.0, imageBranch < 0.5 ? 0.5 * (total + 1.0) : 0.5 * (total - 1.0));
  vec3 azimuth = length(tangent) > 0.00001 ? normalize(tangent) : normalize(cross(axis, vec3(0.01, 1.0, 0.0)));
  return eye + normalize(axis + azimuth * theta) * length(toStar);
}
