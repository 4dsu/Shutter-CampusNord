import * as THREE from "three";
import {
  type MapData,
  MAP_FORMAT_VERSION,
  TerrainField,
  buildBuildingsMesh,
  buildCampusFacades,
  buildTerrainMesh,
  buildWallsMesh,
} from "@shutter/shared/map";
import { bakeGround, groundTexture } from "./groundTexture.ts";
import { createLabels } from "./labels.ts";
import { createFacadeMaterial, createTerrainMaterial } from "./materials.ts";
import { toBufferGeometry } from "./meshes.ts";
import { createProps } from "./props.ts";
import { loadPbr } from "./textures.ts";

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

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const bricks = loadPbr("bricks", 1.2, 1.2, aniso);
  const concreteTex = loadPbr("concrete", 2, 1, aniso);
  const plaster = loadPbr("plaster", 2, 1, aniso);

  // Terra: l'ortofoto real si n'hi ha; si no, el terra pintat a partir de les zones d'OSM.
  const groundImage: CanvasImageSource = ortho ?? bakeGround(map, terrain, 0.25);
  const groundTex = ortho ? orthoTexture(ortho, renderer) : groundTexture(groundImage as HTMLCanvasElement, renderer);
  const ground = new THREE.Mesh(toBufferGeometry(buildTerrainMesh(terrain)), createTerrainMaterial(groundTex, !!ortho, ortho ? { concrete: concreteTex, brick: bricks } : undefined));
  ground.name = "terrain";
  ground.receiveShadow = true;
  group.add(ground);

  // Terrats de tots els edificis; parets llises (amb finestres al shader) només dels que no tenen kit de façana.
  const { roofs } = buildBuildingsMesh(map.buildings);
  const { walls } = buildBuildingsMesh(map.buildings.filter((b) => b.facade !== "campus"));
  const facadeMaterial = createFacadeMaterial();
  Object.assign(facadeMaterial, plaster);
  const facades = new THREE.Mesh(toBufferGeometry(walls), facadeMaterial);
  facades.name = "facades";
  facades.castShadow = true;
  facades.receiveShadow = true;

  // Kit de façana A–D: formigó, maó, vidre i lamel·les amb relleu real.
  const kit = buildCampusFacades(map.buildings);
  const kitMaterials = {
    // Tint una mica més vermell i fosc: de lluny el mosaic es veia massa taronja (foto real de B3).
    brick: new THREE.MeshStandardMaterial({ ...bricks, color: 0xc49a8c, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ ...concreteTex, color: 0xd8d4cc, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c252e, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.4 }),
    louver: new THREE.MeshStandardMaterial({ color: 0xdcdcd6, roughness: 0.55, metalness: 0.2 }),
  };
  for (const key of ["brick", "concrete", "glass", "louver"] as const) {
    const mesh = new THREE.Mesh(toBufferGeometry(kit[key]), kitMaterials[key]);
    mesh.name = `kit-${key}`;
    mesh.castShadow = key !== "glass";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
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
