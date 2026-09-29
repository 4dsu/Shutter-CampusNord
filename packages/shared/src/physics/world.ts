import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { buildBuildingsMesh, buildTerrainMesh, buildWallsMesh, mergeForCollision } from "../map/geometry.ts";
import type { TerrainField } from "../map/terrain.ts";
import type { MapData, Vec2 } from "../map/types.ts";
import type { Vec3 } from "../math.ts";
import { QUERY_WORLD_ONLY, WORLD_GROUPS } from "./groups.ts";
import { propShapes } from "./props.ts";
import { type Rapier, loadRapier } from "./rapier.ts";

export type SurfaceKind = "terrain" | "building" | "wall" | "prop" | "boundary";

export interface RayHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
  surface: SurfaceKind;
}

/** Alçada dels murs invisibles del límit jugable per sobre del terreny. */
const BOUNDARY_HEIGHT = 40;

/**
 * Món de col·lisions estàtic construït a partir del mapa. És el mateix al client (predicció) i al servidor (autoritat).
 */
export class PhysicsWorld {
  readonly rapier: Rapier;
  readonly world: RAPIER_NS.World;
  private readonly surfaces = new Map<number, SurfaceKind>();

  private constructor(rapier: Rapier) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
  }

  static async create(map: MapData, terrain: TerrainField): Promise<PhysicsWorld> {
    const physics = new PhysicsWorld(await loadRapier());
    physics.build(map, terrain);
    return physics;
  }

  private addStatic(desc: RAPIER_NS.ColliderDesc, surface: SurfaceKind): void {
    const collider = this.world.createCollider(desc.setCollisionGroups(WORLD_GROUPS).setSolverGroups(WORLD_GROUPS));
    this.surfaces.set(collider.handle, surface);
  }

  private addTrimesh(mesh: { positions: Float32Array; indices: Uint32Array }, surface: SurfaceKind): void {
    if (mesh.indices.length === 0) return;
    this.addStatic(this.rapier.ColliderDesc.trimesh(mesh.positions, mesh.indices), surface);
  }

  private build(map: MapData, terrain: TerrainField): void {
    const R = this.rapier;
    this.addTrimesh(mergeForCollision([buildTerrainMesh(terrain)]), "terrain");
    const { walls, roofs } = buildBuildingsMesh(map.buildings);
    this.addTrimesh(mergeForCollision([walls, roofs]), "building");
    this.addTrimesh(mergeForCollision([buildWallsMesh(map.walls, terrain)]), "wall");
    this.addTrimesh(boundaryMesh(map.playArea, terrain), "boundary");

    for (const p of map.props) {
      const base = terrain.heightAt(p.pos[0], p.pos[1]) - 0.05;
      const rotation = { x: 0, y: Math.sin(p.rot / 2), z: 0, w: Math.cos(p.rot / 2) };
      for (const s of propShapes(p.kind, p.scale)) {
        if (s.type === "cylinder") {
          this.addStatic(R.ColliderDesc.cylinder(s.halfHeight, s.radius).setTranslation(p.pos[0], base + s.y, p.pos[1]), "prop");
        } else {
          // Desplaçament local en z girat amb l'objecte.
          const ox = Math.sin(p.rot) * s.z;
          const oz = Math.cos(p.rot) * s.z;
          this.addStatic(
            R.ColliderDesc.cuboid(s.hx, s.hy, s.hz)
              .setTranslation(p.pos[0] + ox, base + s.y, p.pos[1] + oz)
              .setRotation(rotation),
            "prop",
          );
        }
      }
    }
    // Les consultes (raigs, controlador) fan servir la fase ampla, que s'actualitza en fer un pas.
    this.world.step();
  }

  /** Raig contra el món estàtic. `dir` ha d'estar normalitzada. */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): RayHit | null {
    const ray = new this.rapier.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, QUERY_WORLD_ONLY);
    if (!hit) return null;
    const d = hit.timeOfImpact;
    return {
      distance: d,
      point: { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      surface: this.surfaces.get(hit.collider.handle) ?? "terrain",
    };
  }

  dispose(): void {
    this.world.free();
  }
}

/** Murs verticals invisibles al llarg del límit jugable. */
function boundaryMesh(ring: Vec2[], terrain: TerrainField): { positions: Float32Array; indices: Uint32Array } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ha = terrain.heightAt(a[0], a[1]);
    const hb = terrain.heightAt(b[0], b[1]);
    const bottom = Math.min(ha, hb) - 5;
    const base = positions.length / 3;
    positions.push(a[0], bottom, a[1], b[0], bottom, b[1], b[0], hb + BOUNDARY_HEIGHT, b[1], a[0], ha + BOUNDARY_HEIGHT, a[1]);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
