import * as THREE from "three";
import {
  type MapData,
  MAP_FORMAT_VERSION,
  TerrainField,
  buildBuildingsMesh,
  buildTerrainMesh,
  buildWallsMesh,
} from "@shutter/shared/map";
import { bakeGround, groundTexture } from "./groundTexture.ts";
import { createLabels } from "./labels.ts";
import { createFacadeMaterial, createRoofMaterial, createTerrainMaterial } from "./materials.ts";
import { toBufferGeometry } from "./meshes.ts";
import { createProps } from "./props.ts";

export interface LoadedMap {
  map: MapData;
  terrain: TerrainField;
}

export async function loadMap(url: string): Promise<LoadedMap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No s'ha pogut carregar el mapa (${res.status})`);
  const map = (await res.json()) as MapData;
  if (map.format !== MAP_FORMAT_VERSION) throw new Error(`Format de mapa ${map.format} no suportat`);
  return { map, terrain: TerrainField.fromData(map.terrain) };
}

export interface World {
  group: THREE.Group;
  groundCanvas: HTMLCanvasElement;
}

export function createWorld({ map, terrain }: LoadedMap, renderer: THREE.WebGLRenderer): World {
  const group = new THREE.Group();
  group.name = "world";

  const groundCanvas = bakeGround(map, terrain, 0.25);
  const ground = new THREE.Mesh(toBufferGeometry(buildTerrainMesh(terrain)), createTerrainMaterial(groundTexture(groundCanvas, renderer)));
  ground.name = "terrain";
  ground.receiveShadow = true;
  group.add(ground);

  const { walls, roofs } = buildBuildingsMesh(map.buildings);
  const facades = new THREE.Mesh(toBufferGeometry(walls), createFacadeMaterial());
  facades.name = "facades";
  facades.castShadow = true;
  facades.receiveShadow = true;
  const roofMesh = new THREE.Mesh(toBufferGeometry(roofs), createRoofMaterial());
  roofMesh.name = "roofs";
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(facades, roofMesh);

  const wallMesh = new THREE.Mesh(
    toBufferGeometry(buildWallsMesh(map.walls, terrain)),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  );
  wallMesh.name = "walls";
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  group.add(createProps(map.props, terrain));
  group.add(createLabels(map.buildings));

  return { group, groundCanvas };
}
