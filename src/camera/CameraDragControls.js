// @ts-nocheck
import * as THREE from 'three'
import { Observer } from './Observer';

/**
 * @param {HTMLElement | Document} domElement
 * @returns {domElement is HTMLElement}
 */
function isHTMLElement(domElement) {
  return domElement !== document;
}

/**
 * Orbit-style drag controls — drag orbits the camera around the black hole.
 * Horizontal drag changes azimuth (theta), vertical drag changes elevation.
 * Direction is always computed as normalize(-position) via observer.applyOrbitPosition(),
 * so there is zero gimbal/roll regardless of orbit angle.
 * @member {HTMLElement} domElement
 */
export class CameraDragControls {

  /**
   * @param {Observer} observer
   * @param {HTMLElement} domElement
   */
  constructor(observer, domElement) {
    this.domElement = (domElement !== undefined) ? domElement : document;
    this.observer = observer;
    // up stays as world-Y (0,1,0) — look-at handles orientation, no tilt needed

    this.enabled = true;

    this.lookSpeed = 0.005;

    this.offsetX = 0
    this.offsetY = 0
    this.lastX = 0
    this.lastY = 0

    this.viewHalfX = 0
    this.viewHalfY = 0

    if (isHTMLElement(this.domElement)) {
      this.domElement.setAttribute('tabindex', '-1');
    }

    this.addMouseEventHandlers();
    this.handleResize();
  }

  handleResize() {
    if (!isHTMLElement(this.domElement)) {
      this.viewHalfX = window.innerWidth / 2;
      this.viewHalfY = window.innerHeight / 2;
    } else {
      this.viewHalfX = this.domElement.offsetWidth / 2;
      this.viewHalfY = this.domElement.offsetHeight / 2;
    }
  }

  update(delta) {
    if (this.enabled === false) return;

    if (this.mouseDragOn) {
      // Horizontal drag → orbit azimuth (theta) around the black hole
      this.observer.theta -= this.lookSpeed * this.offsetX

      // Vertical drag → elevation angle (clamp to avoid poles)
      this.observer.elevationAngle = Math.max(
        2 * Math.PI / 180,   // min 2° — stay just above disk plane
        Math.min(
          80 * Math.PI / 180, // max 80° — avoid top-down singularity
          this.observer.elevationAngle - this.lookSpeed * this.offsetY
        )
      )

      this.offsetX /= 2;
      this.offsetY /= 2;
    }

    // Recompute position + direction with latest theta + elevation
    // (auto-orbit already advanced theta in observer.update(); drag adds on top)
    this.observer.applyOrbitPosition()
  }


  addMouseEventHandlers() {
    this.domElement.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    this.domElement.addEventListener('mousemove', (event) => {
      if (this.mouseDragOn) {
        let newX, newY;
        if (!isHTMLElement(this.domElement)) {
          newX = event.pageX - this.viewHalfX;
          newY = event.pageY - this.viewHalfY;
        } else {
          newX = event.pageX - this.domElement.offsetLeft - this.viewHalfX;
          newY = event.pageY - this.domElement.offsetTop - this.viewHalfY;
        }

        this.offsetX = newX - this.lastX;
        this.offsetY = newY - this.lastY;
        this.lastX = newX;
        this.lastY = newY;
      }
    });

    this.domElement.addEventListener('mousedown', event => {
      if (isHTMLElement(this.domElement)) {
        this.domElement.focus();
      }
      event.preventDefault();
      event.stopPropagation();
      this.mouseDragOn = true;
      if (!isHTMLElement(this.domElement)) {
        this.lastX = event.pageX - this.viewHalfX;
        this.lastY = event.pageY - this.viewHalfY;
      } else {
        this.lastX = event.pageX - this.domElement.offsetLeft - this.viewHalfX;
        this.lastY = event.pageY - this.domElement.offsetTop - this.viewHalfY;
      }
    });

    this.domElement.addEventListener('mouseup', (event) => {
      event.preventDefault();
      event.stopPropagation();

      this.mouseDragOn = false;
      this.offsetX = 0;
      this.offsetY = 0;
    });
  }

}