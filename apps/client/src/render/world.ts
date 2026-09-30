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
import { createFacadeMaterial, createTerrainMaterial } from "./materials.ts";
import { toBufferGeometry } from "./meshes.ts";
import { createProps } from "./props.ts";

export interface LoadedMap {
  map: MapData;
  terrain: TerrainField;
  /** Ortofoto de l'ICGC que cobreix l'extensió del terreny (fila 0 = nord). */
  ortho: ImageBitmap | null;
}

export async function loadMap(url: string): Promise<LoadedMap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No s'ha pogut carregar el mapa (${res.status})`);
  const map = (await res.json()) as MapData;
  if (map.format !== MAP_FORMAT_VERSION) throw new Error(`Format de mapa ${map.format} no suportat`);
  let ortho: ImageBitmap | null = null;
  if (map.orthophoto) {
    const img = await fetch(new URL(map.orthophoto.file, new URL(url, location.href)));
    if (img.ok) ortho = await createImageBitmap(await img.blob());
  }
  return { map, terrain: TerrainField.fromData(map.terrain), ortho };
}

export interface World {
  group: THREE.Group;
  /** Imatge del terra vist des de dalt (serveix per al minimapa). */
  groundImage: CanvasImageSource;
}

function orthoTexture(image: ImageBitmap, renderer: THREE.WebGLRenderer): THREE.Texture {
  const tex = new THREE.Texture(image);
  tex.flipY = false; // fila 0 = z mínima = uv.v 0 (ImageBitmap no es gira)
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createWorld({ map, terrain, ortho }: LoadedMap, renderer: THREE.WebGLRenderer): World {
  const group = new THREE.Group();
  group.name = "world";

  // Terra: l'ortofoto real si n'hi ha; si no, el terra pintat a partir de les zones d'OSM.
  const groundImage: CanvasImageSource = ortho ?? bakeGround(map, terrain, 0.25);
  const groundTex = ortho ? orthoTexture(ortho, renderer) : groundTexture(groundImage as HTMLCanvasElement, renderer);
  const ground = new THREE.Mesh(toBufferGeometry(buildTerrainMesh(terrain)), createTerrainMaterial(groundTex, !!ortho));
  ground.name = "terrain";
  ground.receiveShadow = true;
  group.add(ground);

  const { walls, roofs } = buildBuildingsMesh(map.buildings);
  const facades = new THREE.Mesh(toBufferGeometry(walls), createFacadeMaterial());
  facades.name = "facades";
  facades.castShadow = true;
  facades.receiveShadow = true;
  const roofMaterial = new THREE.MeshStandardMaterial({ vertexColors: !ortho, roughness: 0.95 });
  if (ortho) {
    // Els terrats tenen uv = (x, z) en metres: es projecta l'ortofoto des de dalt.
    const width = (terrain.cols - 1) * terrain.cellSize;
    const depth = (terrain.rows - 1) * terrain.cellSize;
    const roofTex = groundTex.clone();
    roofTex.repeat.set(1 / width, 1 / depth);
    roofTex.offset.set(-terrain.originX / width, -terrain.originZ / depth);
    roofTex.needsUpdate = true;
    roofMaterial.map = roofTex;
    roofMaterial.color.setScalar(0.62); // la foto ja porta la llum del sol
  }
  const roofMesh = new THREE.Mesh(toBufferGeometry(roofs), roofMaterial);
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

  return { group, groundImage };
}
