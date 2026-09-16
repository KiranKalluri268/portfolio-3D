uniform sampler2D diskTexture;
uniform float time;
uniform vec3 localCamera;
uniform mat4 localToClip;
varying vec3 localSurface;

// Same effective acceleration and disk texture/radii as the reference shader.
// Escaped rays draw nothing: this material never creates surrounding stars.
vec3 acceleration(vec3 p, float h2) {
  float r2 = max(dot(p, p), 0.01);
  return -1.5 * h2 * p / (r2 * r2 * sqrt(r2));
}
void main() {
  vec3 ray = normalize(localSurface - localCamera);
  vec3 p = localCamera;
  float start = 0.0;
  if (length(p) > 18.0) {
    float b = dot(p, ray);
    float discriminant = b*b - dot(p,p) + 324.0;
    if (discriminant < 0.0 || b > 0.0) discard;
    start = max(0.0, -b - sqrt(discriminant));
    p += ray * start;
  }
  vec3 velocity = ray;
  vec3 angular = cross(p, velocity);
  float h2 = dot(angular, angular);
  vec3 emission = vec3(0.0);
  float travelled = start;
  float hitDistance = 1e10;
  bool absorbed = length(p) <= 1.0;
  if (absorbed) hitDistance = 0.06;
  for (int i = 0; i < 512; i++) {
    if (absorbed) break;
    float r = length(p);
    if (r > 18.1 && dot(p, velocity) > 0.0) break;
    float stepSize = clamp(r * 0.025, 0.018, 0.45);
    vec3 old = p;
    vec3 a = acceleration(p, h2);
    p += velocity * stepSize + 0.5 * a * stepSize * stepSize;
    velocity += 0.5 * (a + acceleration(p, h2)) * stepSize;
    travelled += length(p - old);
    if (old.y * p.y < 0.0) {
      float fraction = old.y / (old.y - p.y);
      vec3 intersection = mix(old, p, fraction);
      float diskRadius = length(intersection);
      if (diskRadius >= 2.0 && diskRadius <= 6.0) {
        float phi = atan(intersection.x, intersection.z) - time;
        vec3 diskVelocity = vec3(-intersection.x, 0.0, intersection.z)
          * inversesqrt(2.0 * (diskRadius - 1.0)) / (diskRadius * diskRadius);
        float doppler = inversesqrt(1.0 - dot(diskVelocity, diskVelocity))
          * (1.0 + dot(normalize(velocity), diskVelocity));
        vec4 disk = texture2D(diskTexture, vec2(fract(phi / 6.28318530718),
          1.0 - (diskRadius - 2.0) / 4.0)) / doppler;
        float alpha = clamp(dot(disk, disk) / 4.5, 0.0, 1.0);
        emission += disk.rgb * alpha / (doppler * doppler * doppler);
        hitDistance = min(hitDistance, travelled);
      }
    }
    if (length(p) <= 1.0) {
      absorbed = true;
      hitDistance = min(hitDistance, travelled);
    }
  }
  if (!absorbed && hitDistance > 1e9) discard;
  // Use ray-hit distance, not the enclosing sphere, for foreground occlusion.
  vec4 clip = localToClip * vec4(localCamera + ray * hitDistance, 1.0);
  gl_FragDepthEXT = clamp(0.5 + 0.5 * clip.z / clip.w, 0.0, 1.0);
  gl_FragColor = vec4(emission * 1.15, 1.0);
}
