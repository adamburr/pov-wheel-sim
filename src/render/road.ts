// The road the bike rides on, and the light: the ground and lane marks, the sky's colour and the
// lights, from night through dusk to day.
import * as THREE from 'three';

const night = new THREE.Color(0x05070d), dusk = new THREE.Color(0x34405c), day = new THREE.Color(0x9db8d8);

export class Road {
  /** The sky's colour, which the views clear to. */
  readonly sky = new THREE.Color();
  private hemi = new THREE.HemisphereLight(0xc8d8ff, 0x2a2420, 1);
  private sun = new THREE.DirectionalLight(0xfff4e0, 1);
  private ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.95 }),
  );
  private laneMarks = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    this.sun.position.set(2, 4, 3);
    this.ground.rotation.x = -Math.PI / 2;
    for (let i = -15; i <= 15; i++) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a8a70 }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(i * 2, 0.001, -0.9);
      this.laneMarks.add(mark);
    }
    scene.add(this.hemi, this.sun, this.ground, this.laneMarks);
  }

  /** Light the scene for `ambient` (0 night, 0.5 dusk, 1 day), with the road under a tire of this radius. */
  update(ambient: number, tireRadius: number) {
    this.ground.position.y = -tireRadius;
    this.laneMarks.position.y = -tireRadius;
    this.sky.copy(night).lerp(dusk, Math.min(1, ambient * 2)).lerp(day, Math.max(0, ambient * 2 - 1));
    this.scene.background = this.sky;
    this.hemi.intensity = ambient * 2.5;
    this.sun.intensity = ambient * 2.5;
  }
}
