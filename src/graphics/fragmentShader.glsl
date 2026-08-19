//#define STEP 0.04
//#define NSTEPS 700
#define PI 3.141592653589793238462643383279
#define DEG_TO_RAD (PI/180.0)
#define ROT_Y(a) mat3(1, 0, 0, 0, cos(a), sin(a), 0, -sin(a), cos(a))
#define ROT_Z(a) mat3(cos(a), -sin(a), 0, sin(a), cos(a), 0, 0, 0, 1)


uniform float time;
uniform vec2 resolution;

uniform vec3 cam_pos;
uniform vec3 cam_dir;
uniform vec3 cam_up;
uniform float fov;
uniform vec3 cam_vel;

const float MIN_TEMPERATURE = 1000.0;
const float TEMPERATURE_RANGE = 39000.0;

// How far left of centre the rays are aimed, in half-screens, so the object being
// orbited sits off to the right instead of in the middle. src/graphics/planet.js
// mirrors this when it aims the planet at a screen position, and must be changed
// with it.
//
// Fitted off the reference with the two scaled to a common height: its shadow
// centres at 0.836 of the width, which is 0.67 half-screens right of the middle,
// far enough that the circle runs off the right edge. The disk runs out to the
// left of it.
//
// Earlier values here came from thresholding the JPEG directly and were wrong
// twice — it is graded, glow fills the shadow, and no threshold separates the
// two. Compare renders against it by eye at a matched height; do not trust a
// number taken off that file alone.
//
// Applied before the aspect scaling, so this is a fraction of the width and the
// composition holds its proportions on any viewport.
const float COMPOSE_SHIFT = 0.67;

// The same thing vertically, in half-screens up. The reference does not show a
// whole black hole: its shadow centres above the top third and runs off the top
// and right edges, so what is in frame is the lower left of the circle with the
// disk crossing the rest. Centred vertically that cannot happen at any distance —
// the shadow grows symmetrically and meets both edges at once — which is why this
// exists rather than the distance being pushed further in.
//
// Fitting the reference's arc gives its centre 0.27 of the way down a frame whose
// middle is 0.5 — 0.46 half-screens up. That is too much here and 0.26 is what
// was kept, because this camera ends up inside the disk's outer edge where the
// reference's is outside it: lifting the frame puts more near-side disk under the
// black hole rather than the empty dark the reference has there, and by 0.46 the
// bottom half of the frame is nothing else.
const float COMPOSE_SHIFT_Y = 0.26;

uniform bool accretion_disk;
uniform bool use_disk_texture;
const float DISK_IN = 2.0;
const float DISK_WIDTH = 4.0;

uniform bool doppler_shift;
uniform bool lorentz_transform;
uniform bool beaming;

uniform sampler2D bg_texture;
uniform sampler2D star_texture;
uniform sampler2D disk_texture;
uniform sampler2D particle_texture; // Lensed stars (small)
uniform sampler2D particle_texture_unlensed; // Unlensed stars (large foreground)
uniform sampler2D planet_texture;
uniform float planet_amount;        // 0 outside the new world, and the target is not even drawn
uniform bool show_lensing;

// ── World appearance ────────────────────────────────────────────────────────
// The same geodesic renders both worlds. Only what the horizon and the sky are
// made of changes, so the lensing that sells the black hole also sells the
// wormhole. At the defaults below this block is a no-op and the output is
// identical to the untinted black hole.
uniform float throat_throughput; // 0.0 = black hole absorbs, 1.0 = wormhole transmits
uniform vec3 disk_tint;
uniform vec3 bg_tint;            // multiplies stars and the nebula plate
uniform vec3 space_color_plane;  // deep space toward the galactic plane
uniform vec3 space_color_pole;   // deep space away from it

// The sky on the far side of the throat. Its own rotation and colours, because a
// wormhole that opened onto the same sky it sits in would not read as a way out.
// The gains are not decoration: sampled at the background's own brightness the
// throat is barely distinguishable from the sky around it and disappears entirely
// once the camera has pulled back.
uniform float throat_sky_rotation;
uniform vec3 throat_color_plane;
uniform vec3 throat_color_pole;
uniform vec3 throat_tint;       // multiplies the far side's stars and nebula
uniform float throat_star_gain;
uniform float throat_nebula_gain;



vec2 square_frame(vec2 screen_size){
  vec2 position = 2.0 * (gl_FragCoord.xy / screen_size.xy) - 1.0; 
  // first make pixels arranged in 0..1
  // then by multiplying by 2 and subtracting 1, put them in -1..1
  
  return position;
}

vec2 to_spherical(vec3 cartesian_coord){
  // spherical projection
  // polar angles are directly used as horizontal and vertical coordinates
  // here angle to y-axis mapped to latitude (looking vertically 180 degrees)
  // xz plane to longitude (looking horizontally 360 degrees)
  vec2 uv = vec2(atan(cartesian_coord.z,cartesian_coord.x), asin(cartesian_coord.y)); 
  uv *= vec2(1.0/(2.0*PI), 1.0/PI); //long, lat
  uv += 0.5;
  return uv;
}

vec3 lorentz_transform_velocity(vec3 u, vec3 v){ 
  // u = ray
  // v = observer
  float speed = length(v);
  if (speed > 0.0){
    float gamma = 1.0/sqrt(1.0-dot(v,v));
    
    float denominator = 1.0 - dot(v,u);
    
    vec3 new_u = (u/gamma - v + (gamma/(gamma+1.0)) * dot(u,v)*v)/denominator;
    return new_u;
  }
  return u;
}

vec3 temp_to_color(float temp_kelvin){
  vec3 color;
  // 1k ~ 40k rescale by dividing 100
  temp_kelvin = clamp(temp_kelvin, 1000.0, 40000.0) / 100.0;
  if (temp_kelvin <= 66.0){
    color.r = 255.0;
    color.g = temp_kelvin;
    color.g = 99.4708025861 * log(color.g) - 161.1195681661;
    if (color.g < 0.0) color.g = 0.0;
    if (color.g > 255.0)  color.g = 255.0;
  } else {
    color.r = temp_kelvin - 60.0;
    if (color.r < 0.0) color.r = 0.0;
    color.r = 329.698727446 * pow(color.r, -0.1332047592);
    if (color.r < 0.0) color.r = 0.0;
    if (color.g > 255.0) color.r = 255.0;
    color.g = temp_kelvin - 60.0;
    if (color.g < 0.0) color.g = 0.0;
    color.g = 288.1221695283 * pow(color.g, -0.0755148492);
    if (color.g > 255.0)  color.g = 255.0;  
  }
  if (temp_kelvin >= 66.0){
    color.b = 255.0;
  } else if (temp_kelvin <= 19.0){
    color.b = 0.0;
  } else {
    color.b = temp_kelvin - 10.0;
    color.b = 138.5177312231 * log(color.b) - 305.0447927307;
    if (color.b < 0.0) color.b = 0.0;
    if (color.b > 255.0) color.b = 255.0;
  }
  color /= 255.0; // make it 0..1
  return color;
}


// One sky, sampled twice: once for the background along the unbent ray, and once
// through the wormhole throat along the bent one. Keeping it in a single place is
// what stops the two skies drifting apart as either is tuned.
//   rotation      degrees about Z, so the far side is a different patch of sky
//   doppler_factor pass 1.0 to leave the star temperatures alone
vec3 sample_sky(vec3 dir, float rotation, vec3 tint, vec3 plane_color, vec3 pole_color,
                float star_gain, float nebula_gain, float doppler_factor){
  vec2 tex_coord = to_spherical(dir * ROT_Z(rotation * DEG_TO_RAD));
  vec3 sky = vec3(0.0);

  vec4 star_color = texture2D(star_texture, tex_coord);
  if (star_color.g > 0.0){
    float star_temperature = (MIN_TEMPERATURE + TEMPERATURE_RANGE*star_color.r);
    float star_velocity = star_color.b - 0.5;
    float star_doppler_factor = sqrt((1.0+star_velocity)/(1.0-star_velocity));
    if (doppler_shift)
      star_temperature /= doppler_factor*star_doppler_factor;
    sky += temp_to_color(star_temperature) * tint * star_color.g * star_gain;
  }

  sky += mix(plane_color, pole_color, smoothstep(0.0, 0.55, abs(dir.y)));
  sky += texture2D(bg_texture, tex_coord).rgb * nebula_gain * tint;
  return sky;
}

// https://gist.github.com/fieldOfView/5106319
// https://gamedev.stackexchange.com/questions/93032/what-causes-this-distortion-in-my-perspective-projection-at-steep-view-angles
// for reference
void main()	{
  // z towards you, y towards up, x towards your left
  //  float hfov = (2.0 * ((uv.x+0.5)/resolution.x) - 1.0) * d * resolution.x/resolution.y;
  // float vfov = (1.0 - 2.0 * ((uv.y+0.5)/resolution.y)) * d;
  //  float d = tan(fov*DEG_TO_RAD / 2.0);

  float uvfov = tan(fov / 2.0 * DEG_TO_RAD);
  vec2 uv = square_frame(resolution);

  // Off-center projection: put the black hole up and to the right rather than in
  // the middle. uv is in [-1, +1] on both axes, so subtracting a shift moves the
  // "center" (the black hole) by that much in half-screens. Anything rendered to
  // an offscreen target and sampled back by ray direction has to know about both
  // shifts — see the planet block.
  uv.x -= COMPOSE_SHIFT;
  uv.y -= COMPOSE_SHIFT_Y;

  uv *= vec2(resolution.x/resolution.y, 1.0);
  vec3 forward = normalize(cam_dir); // 
  vec3 up = normalize(cam_up);
  vec3 nright = normalize(cross(forward, up));
  up = cross(nright, forward);
  // generate ray
  vec3 pixel_pos =cam_pos + forward +
                 nright*uv.x*uvfov+ up*uv.y*uvfov;
  
  vec3 ray_dir = normalize(pixel_pos - cam_pos);
  vec3 orig_ray_dir = ray_dir; // saved before geodesic — used when show_lensing is off

  // light aberration alters ray path
  if (lorentz_transform)
    ray_dir = lorentz_transform_velocity(ray_dir, cam_vel);

  
  // initial color
  vec4 color = vec4(0.0,0.0,0.0,1.0);

  // The disk is kept out of `color` and added at the very end. It is emissive and
  // accumulates additively, so the order never used to matter — but the planet is
  // composited alpha-over, and the planet sits far outside the disk. Left in line,
  // the planet's mix wiped the disk wherever the two crossed on screen, which
  // portrait made obvious once the disk grew to fill the frame.
  vec3 disk_glow = vec3(0.0);

  // geodesic by leapfrog integration

  vec3 point = cam_pos;
  vec3 velocity = ray_dir;
  vec3 c = cross(point,velocity);
  float h2 = dot(c,c);

  
  // for doppler effect (using hardware inversesqrt)
  float ray_gamma = inversesqrt(1.0 - dot(cam_vel, cam_vel));
  float ray_doppler_factor = ray_gamma * (1.0 + dot(ray_dir, -cam_vel));
    
  float ray_intensity = 1.0;
  if (beaming) {
    float rdf = ray_doppler_factor;
    ray_intensity /= (rdf * rdf * rdf);
  }
  
  
  vec3 oldpoint; 
  float pointsqr;
  
  float distance = length(point);

  // Leapfrog geodesic
  for (int i=0; i<NSTEPS;i++){ 
    oldpoint = point; // remember previous point for finding intersection
    
    point += velocity * STEP;
    
    // distance from origin
    float distSq = dot(point, point);
    distance = sqrt(distSq);

    // Optimization: Replace expensive pow() with fast multiplication.
    float dist5 = distSq * distSq * distance;
    
    vec3 accel = -1.5 * h2 * point / dist5;
    velocity += accel * STEP;    
    
    bool horizon_mask = distSq < 1.0 && dot(oldpoint, oldpoint) > 1.0;// intersecting eventhorizon
    // does it enter event horizon?
    if (horizon_mask) {
      // A black hole absorbs the ray. A wormhole is a hole — it hands back what
      // is on the other side. Either way the ray terminates here, so everything
      // outside still bends around the same mass and the lensing is untouched.
      //
      // velocity at the crossing is the fully bent direction, so the far sky
      // arrives already swirled toward the rim: the crystal-ball distortion is
      // the integrator's doing, not an effect layered on top. No doppler — the
      // far side is not moving with respect to anything here.
      vec3 through = normalize(velocity);
      vec3 far_side = sample_sky(through, throat_sky_rotation, throat_tint,
                                 throat_color_plane, throat_color_pole,
                                 throat_star_gain, throat_nebula_gain, 1.0);

      // There used to be a grazing-angle rim term here to give the throat an
      // edge. It did, but pow(rim, 3.0) is a function of the crossing angle
      // alone, so it painted the same value all the way around every ray shell
      // and stacked up as hard concentric rings inside the sphere. The swirled
      // sky already reads as a boundary on its own, so the term is gone.

      color += vec4(far_side * throat_throughput, 1.0);
      break;
    }
    
    // intersect accretion disk
    if (accretion_disk){
      if (oldpoint.y * point.y < 0.0){
        // move along y axis
        float lambda = - oldpoint.y/velocity.y;
        vec3 intersection = oldpoint + lambda*velocity;
        float r = length(intersection);//dot(intersection,intersection);
        if (DISK_IN <= r&&r <= DISK_IN+DISK_WIDTH ){
          float phi = atan(intersection.x, intersection.z);
          
          vec3 disk_velocity = vec3(-intersection.x, 0.0, intersection.z) * inversesqrt(2.0*(r-1.0)) / (r*r); 
          phi -= time;
          phi = mod(phi , PI*2.0);
          float disk_gamma = inversesqrt(1.0 - dot(disk_velocity, disk_velocity));
          float disk_doppler_factor = disk_gamma*(1.0+dot(ray_dir/distance, disk_velocity)); // from source 
          
          if (use_disk_texture){
          // texture
            vec2 tex_coord = vec2(mod(phi,2.0*PI)/(2.0*PI),1.0-(r-DISK_IN)/(DISK_WIDTH));
            vec4 disk_color = texture2D(disk_texture, tex_coord) / (ray_doppler_factor * disk_doppler_factor);
            float disk_alpha = clamp(dot(disk_color,disk_color)/4.5,0.0,1.0);

            if (beaming) {
              float ddf = disk_doppler_factor;
              disk_alpha /= (ddf * ddf * ddf);
            }
            
            disk_glow += disk_color.rgb * disk_tint * disk_alpha;
          } else {
          
          // use blackbody 
          float disk_temperature = 10000.0*(pow(r/DISK_IN, -3.0/4.0));
          
            //doppler effect
          if (doppler_shift)
            disk_temperature /= ray_doppler_factor*disk_doppler_factor;

          vec3 disk_color = temp_to_color(disk_temperature) * disk_tint;
          float disk_alpha = clamp(dot(disk_color,disk_color)/3.0,0.0,1.0);
          
          if (beaming) {
            float ddf = disk_doppler_factor;
            disk_alpha /= (ddf * ddf * ddf);
          }
            
          disk_glow += disk_color * disk_alpha;
          
          }
        }
      }
    }
    
  }
  
  if (distance > 1.0){

    // ── Background: ALWAYS straight ray, never affected by lensing toggle ──
    color += vec4(sample_sky(orig_ray_dir, 45.0, bg_tint,
                             space_color_plane, space_color_pole,
                             1.0, 0.2, ray_doppler_factor), 1.0);

    // ── The planet ────────────────────────────────────────────────────────
    // Composited alpha-over, and before the star field and the disk, because it
    // orbits further out than either — so both of those add over it, and only the
    // black hole covers it. The block sits inside "distance > 1.0", so rays that
    // end on the horizon never reach it and the shadow stays clean.
    //
    // Sampled along the BENT ray, the same as the star field, by reconstructing a
    // screen position from the ray direction and reading the planet's target
    // there. It used to be sampled at gl_FragCoord — straight down the unbent ray
    // — and the difference is what the planet is allowed to do.
    //
    // Straight, the planet had to be kept angularly clear of the shadow for the
    // whole fall, because a straight ray aimed behind the black hole terminates at
    // the horizon and never reaches this block: the planet would not be occluded
    // so much as deleted. That clearance is a hard floor on how near the black
    // hole it can be placed, and it is the reason the planet kept coming out
    // further away than wanted.
    //
    // Bent, rays that pass close to the black hole curve around it rather than
    // ending on it, so they find the planet even when it is geometrically behind.
    // It goes where it likes: near the rim the image is pushed outward and drawn
    // into an arc, which is the real behaviour, and directly behind it wraps the
    // photon ring instead of vanishing.
    //
    // The inverse of the projection at the top of main(), COMPOSE_SHIFT included —
    // which is the one thing the particle blocks below get to skip, since their
    // cameras are centred. Skipping it there is why they sample nothing across the
    // left quarter of the frame. A planet would be sliced down a hard vertical
    // edge by that, so it is carried here.
    if (planet_amount > 0.0) {
      vec3 planet_dir = show_lensing ? normalize(point - oldpoint) : orig_ray_dir;
      float planet_fwd = dot(planet_dir, forward);
      if (planet_fwd > 0.0) {
        float planet_aspect = resolution.x / resolution.y;
        float planet_x = dot(planet_dir, nright) / (planet_fwd * uvfov * planet_aspect) + COMPOSE_SHIFT;
        float planet_y = dot(planet_dir, up) / (planet_fwd * uvfov) + COMPOSE_SHIFT_Y;
        vec2 planet_uv = vec2(planet_x, planet_y) * 0.5 + 0.5;
        if (planet_uv.x > 0.0 && planet_uv.x < 1.0 && planet_uv.y > 0.0 && planet_uv.y < 1.0) {
          vec4 planet = texture2D(planet_texture, planet_uv);
          color.rgb = mix(color.rgb, planet.rgb, planet.a * planet_amount);
        }
      }
    }

    // ── Screen-space lensed particles (Option B) ──────────────────────────
    // Project the bent ray direction onto the camera frustum to get screen UV,
    // then sample the off-screen particle framebuffer at that position.
    // show_lensing ON  → use lensed direction → particles arc around BH
    // show_lensing OFF → use straight direction → particles at true 3D positions
    vec3 sample_dir = show_lensing ? normalize(point - oldpoint) : orig_ray_dir;
    float fwd_dot = dot(sample_dir, forward);
    if (fwd_dot > 0.0) {
      float aspect = resolution.x / resolution.y;
      float px = dot(sample_dir, nright) / (fwd_dot * uvfov);
      float py = dot(sample_dir, up)    / (fwd_dot * uvfov);
      // Lensed particles (small stars)
      vec2 p_uv = vec2(px / aspect * 0.5 + 0.5, py * 0.5 + 0.5);
      if (p_uv.x > 0.0 && p_uv.x < 1.0 && p_uv.y > 0.0 && p_uv.y < 1.0) {
        color += texture2D(particle_texture, p_uv);
      }
    }
    
    // Unlensed particles (bright foreground stars) - always use orig_ray_dir
    float orig_fwd_dot = dot(orig_ray_dir, forward);
    if (orig_fwd_dot > 0.0) {
      float aspect = resolution.x / resolution.y;
      float orig_px = dot(orig_ray_dir, nright) / (orig_fwd_dot * uvfov);
      float orig_py = dot(orig_ray_dir, up)    / (orig_fwd_dot * uvfov);
      vec2 p_uv_unlensed = vec2(orig_px / aspect * 0.5 + 0.5, orig_py * 0.5 + 0.5);
      if (p_uv_unlensed.x > 0.0 && p_uv_unlensed.x < 1.0 && p_uv_unlensed.y > 0.0 && p_uv_unlensed.y < 1.0) {
        color += texture2D(particle_texture_unlensed, p_uv_unlensed);
      }
    }

  }

  // Added last so it lies over the planet, which is far outside it.
  color.rgb += disk_glow;

  gl_FragColor = color*ray_intensity;
}
