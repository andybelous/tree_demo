import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Pane } from "tweakpane";
import Stats from "stats.js";
import {
  Tree,
  TreePreset,
  TreeType,
  BarkType,
  LeafType,
  Billboard,
} from "@dgreenheck/ez-tree";

/**
 * Deep clone helper
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Compute vertex/triangle counts for an object (sums meshes)
 */
function computeCounts(obj) {
  let vertices = 0;
  let triangles = 0;
  obj.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const geom = o.geometry;
      if (geom.index) {
        triangles += geom.index.count / 3;
      } else if (geom.attributes && geom.attributes.position) {
        triangles += geom.attributes.position.count / 3;
      }
      if (geom.attributes && geom.attributes.position) {
        vertices += geom.attributes.position.count;
      }
    }
  });
  return { vertices, triangles };
}

export default function TreeDemo() {
  const mountRef = useRef(null);
  const uiContainerRef = useRef(null);

  useEffect(() => {
    if (mountRef.current?.dataset.initialized) return;
    mountRef.current.dataset.initialized = "true";

    // --- SCENE / CAMERA / RENDERER ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.FogExp2(0xffffff, 0.002);

    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(60, 40, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      mountRef.current.clientWidth,
      mountRef.current.clientHeight
    );
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // --- STATS ---
    const stats = new Stats();
    stats.showPanel(0);
    stats.dom.style.position = "absolute";
    stats.dom.style.left = "10px";
    stats.dom.style.top = "10px";
    stats.dom.style.zIndex = "1000";
    mountRef.current.appendChild(stats.dom);

    // --- LIGHTS ---
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.5);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(100, 120, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    scene.add(dirLight);

    // --- GROUND ---
    const groundSize = 500;
    const textureLoader = new THREE.TextureLoader();
    const grassTexture = textureLoader.load("/textures/grass.jpg");
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(40, 40);
    grassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ map: grassTexture })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- CONTROLS ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // --- FOREST GROUP ---
    const forestGroup = new THREE.Group();
    forestGroup.name = "Forest";
    scene.add(forestGroup);

    const placedPositions = [];
    const minDistance = 40;
    const safeRadius = groundSize / 2 - 40;

    function getRandomPosition() {
      let pos;
      let tries = 0;
      do {
        const x = THREE.MathUtils.randFloatSpread(safeRadius * 2);
        const z = THREE.MathUtils.randFloatSpread(safeRadius * 2);
        pos = new THREE.Vector3(x, 0, z);
        tries++;
        if (tries > 200) break;
      } while (placedPositions.some((p) => p.distanceTo(pos) < minDistance));
      placedPositions.push(pos);
      return pos;
    }

    // --- Create a sample tree to pull default options for UI ---
    const sampleTree = new Tree();
    sampleTree.loadPreset("Ash Medium");
    sampleTree.options.seed = 12345;
    sampleTree.generate();

    // settings object is what tweakpane will bind to
    const settings = deepClone(sampleTree.options);

    // params for pane / info
    const params = {
      treeCount: 15,
      preset: sampleTree.options.preset || "Ash Medium",
      vertexCount: 0,
      triangleCount: 0,
    };

    // --- FOREST CREATION (applies settings to each tree) ---
    function createForest(count) {
      // cleanup existing
      while (forestGroup.children.length > 0) {
        const obj = forestGroup.children.pop();
        obj.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            // try to dispose material textures safely
            if (o.material.map) {
              o.material.map.dispose();
            }
            o.material.dispose();
          }
        });
      }
      placedPositions.length = 0;

      // MAIN tree (center) - construct from settings
      const mainTree = new Tree();
      // if preset present in settings, apply via loadPreset to ensure proper defaults
      if (settings.preset) {
        try {
          mainTree.loadPreset(settings.preset);
        } catch (e) {
          // ignore if preset unknown
        }
      }
      // copy settings (deep) into tree.options
      mainTree.options = deepClone(settings);
      // ensure seed exists
      if (typeof mainTree.options.seed === "undefined") mainTree.options.seed = 12345;
      mainTree.generate();
      mainTree.castShadow = true;
      mainTree.receiveShadow = true;
      mainTree.position.set(0, 0, 0);
      forestGroup.add(mainTree);

      // set info counters from mainTree
      const counts = computeCounts(mainTree);
      params.vertexCount = counts.vertices;
      params.triangleCount = counts.triangles;

      // OTHER TREES
      for (let i = 1; i < count; i++) {
        const t = new Tree();
        // apply same preset as main (so options structure exists)
        if (settings.preset) {
          try {
            t.loadPreset(settings.preset);
          } catch (e) {}
        }
        // apply same options but change seed slightly
        const opt = deepClone(settings);
        opt.seed = Math.floor(Math.random() * 1000000);
        t.options = opt;
        t.generate();
        t.castShadow = true;
        t.receiveShadow = true;
        const pos = getRandomPosition();
        t.position.copy(pos);
        forestGroup.add(t);
      }

      // focus camera on geometric center of main tree (not base)
      const box = new THREE.Box3().setFromObject(mainTree);
      const center = new THREE.Vector3();
      box.getCenter(center);
      controls.target.copy(center);
      controls.update();
    }

    // initial forest
    createForest(params.treeCount);

    // --- TWEAKPANE UI ---
    const pane = new Pane({
      container: uiContainerRef.current,
      title: "EZ Tree Controls",
    });

    // helper: call after any change to update forest
    const onChange = () => {
      createForest(params.treeCount);
      pane.refresh();
    };

    // Tree folder
    const tab = pane.addTab({
      pages: [{ title: "Parameters" }],
    });

    const treeFolder = tab.pages[0].addFolder({ title: "Tree", expanded: true });
    treeFolder.on("change", onChange);

    // Preset dropdown (when user picks preset, we load preset into settings and refresh pane)
    treeFolder
      .addBlade({
        view: "list",
        label: "preset",
        options: Object.keys(TreePreset).map((p) => ({ text: p, value: p })),
        value: params.preset,
      })
      .on("change", (e) => {
        params.preset = e.value;
        // create temp tree to get default options for that preset
        const tmp = new Tree();
        try {
          tmp.loadPreset(e.value);
        } catch (err) {
          console.warn("Unknown preset", e.value);
        }
        // replace settings with preset defaults but keep seed if present
        const currentSeed = settings.seed ?? 12345;
        Object.assign(settings, deepClone(tmp.options));
        settings.seed = currentSeed;
        // update UI and forest
        pane.refresh();
        onChange();
      });

    // bind seed
    treeFolder.addBinding(settings, "seed", { min: 0, max: 65536, step: 1 });

    // Bark
    const barkFolder = treeFolder.addFolder({ title: "Bark", expanded: false });
    barkFolder.addBinding(settings.bark, "type", { options: BarkType });
    barkFolder.addBinding(settings.bark, "tint", { view: "color" });
    barkFolder.addBinding(settings.bark, "flatShading");
    barkFolder.addBinding(settings.bark, "textured");
    barkFolder.addBinding(settings.bark.textureScale, "x", { min: 0.5, max: 5 });
    barkFolder.addBinding(settings.bark.textureScale, "y", { min: 0.5, max: 5 });

    // Branches
    const branchFolder = treeFolder.addFolder({ title: "Branches", expanded: false });
    branchFolder.addBinding(settings, "type", { options: TreeType });
    branchFolder.addBinding(settings.branch, "levels", { min: 0, max: 3, step: 1 });

    const branchAngleFolder = branchFolder.addFolder({ title: "Angle", expanded: false });
    branchAngleFolder.addBinding(settings.branch.angle, "1", { min: 0, max: 180 });
    branchAngleFolder.addBinding(settings.branch.angle, "2", { min: 0, max: 180 });
    branchAngleFolder.addBinding(settings.branch.angle, "3", { min: 0, max: 180 });

    const childrenFolder = branchFolder.addFolder({ title: "Children", expanded: false });
    childrenFolder.addBinding(settings.branch.children, "0", { min: 0, max: 100, step: 1 });
    childrenFolder.addBinding(settings.branch.children, "1", { min: 0, max: 10, step: 1 });
    childrenFolder.addBinding(settings.branch.children, "2", { min: 0, max: 5, step: 1 });

    const gnarlinessFolder = branchFolder.addFolder({ title: "Gnarliness", expanded: false });
    gnarlinessFolder.addBinding(settings.branch.gnarliness, "0", { min: -0.5, max: 0.5 });
    gnarlinessFolder.addBinding(settings.branch.gnarliness, "1", { min: -0.5, max: 0.5 });
    gnarlinessFolder.addBinding(settings.branch.gnarliness, "2", { min: -0.5, max: 0.5 });
    gnarlinessFolder.addBinding(settings.branch.gnarliness, "3", { min: -0.5, max: 0.5 });

    const forceFolder = branchFolder.addFolder({ title: "Growth Direction", expanded: false });
    forceFolder.addBinding(settings.branch.force.direction, "x", { min: -1, max: 1 });
    forceFolder.addBinding(settings.branch.force.direction, "y", { min: -1, max: 1 });
    forceFolder.addBinding(settings.branch.force.direction, "z", { min: -1, max: 1 });
    forceFolder.addBinding(settings.branch.force, "strength", { min: -0.1, max: 0.1, step: 0.001 });

    const lengthFolder = branchFolder.addFolder({ title: "Length", expanded: false });
    lengthFolder.addBinding(settings.branch.length, "0", { min: 0.1, max: 100 });
    lengthFolder.addBinding(settings.branch.length, "1", { min: 0.1, max: 100 });
    lengthFolder.addBinding(settings.branch.length, "2", { min: 0.1, max: 100 });
    lengthFolder.addBinding(settings.branch.length, "3", { min: 0.1, max: 100 });

    const branchRadiusFolder = branchFolder.addFolder({ title: "Radius", expanded: false });
    branchRadiusFolder.addBinding(settings.branch.radius, "0", { min: 0.1, max: 5 });
    branchRadiusFolder.addBinding(settings.branch.radius, "1", { min: 0.1, max: 5 });
    branchRadiusFolder.addBinding(settings.branch.radius, "2", { min: 0.1, max: 5 });
    branchRadiusFolder.addBinding(settings.branch.radius, "3", { min: 0.1, max: 5 });

    const sectionsFolder = branchFolder.addFolder({ title: "Sections", expanded: false });
    sectionsFolder.addBinding(settings.branch.sections, "0", { min: 1, max: 20, step: 1 });
    sectionsFolder.addBinding(settings.branch.sections, "1", { min: 1, max: 20, step: 1 });
    sectionsFolder.addBinding(settings.branch.sections, "2", { min: 1, max: 20, step: 1 });
    sectionsFolder.addBinding(settings.branch.sections, "3", { min: 1, max: 20, step: 1 });

    const segmentsFolder = branchFolder.addFolder({ title: "Segments", expanded: false });
    segmentsFolder.addBinding(settings.branch.segments, "0", { min: 3, max: 16, step: 1 });
    segmentsFolder.addBinding(settings.branch.segments, "1", { min: 3, max: 16, step: 1 });
    segmentsFolder.addBinding(settings.branch.segments, "2", { min: 3, max: 16, step: 1 });
    segmentsFolder.addBinding(settings.branch.segments, "3", { min: 3, max: 16, step: 1 });

    const branchStartFolder = branchFolder.addFolder({ title: "Start", expanded: false });
    branchStartFolder.addBinding(settings.branch.start, "1", { min: 0, max: 1 });
    branchStartFolder.addBinding(settings.branch.start, "2", { min: 0, max: 1 });
    branchStartFolder.addBinding(settings.branch.start, "3", { min: 0, max: 1 });

    const taperFolder = branchFolder.addFolder({ title: "Taper", expanded: false });
    taperFolder.addBinding(settings.branch.taper, "0", { min: 0, max: 1 });
    taperFolder.addBinding(settings.branch.taper, "1", { min: 0, max: 1 });
    taperFolder.addBinding(settings.branch.taper, "2", { min: 0, max: 1 });
    taperFolder.addBinding(settings.branch.taper, "3", { min: 0, max: 1 });

    const twistFolder = branchFolder.addFolder({ title: "Twist", expanded: false });
    twistFolder.addBinding(settings.branch.twist, "0", { min: -0.5, max: 0.5 });
    twistFolder.addBinding(settings.branch.twist, "1", { min: -0.5, max: 0.5 });
    twistFolder.addBinding(settings.branch.twist, "2", { min: -0.5, max: 0.5 });
    twistFolder.addBinding(settings.branch.twist, "3", { min: -0.5, max: 0.5 });

    // Leaves
    const leavesFolder = treeFolder.addFolder({ title: "Leaves", expanded: false });
    leavesFolder.addBinding(settings.leaves, "type", { options: LeafType });
    leavesFolder.addBinding(settings.leaves, "tint", { view: "color" });
    leavesFolder.addBinding(settings.leaves, "billboard", { options: Billboard });
    leavesFolder.addBinding(settings.leaves, "angle", { min: 0, max: 100, step: 1 });
    leavesFolder.addBinding(settings.leaves, "count", { min: 0, max: 100, step: 1 });
    leavesFolder.addBinding(settings.leaves, "start", { min: 0, max: 1 });
    leavesFolder.addBinding(settings.leaves, "size", { min: 0, max: 10 });
    leavesFolder.addBinding(settings.leaves, "sizeVariance", { min: 0, max: 1 });
    leavesFolder.addBinding(settings.leaves, "alphaTest", { min: 0, max: 1 });

    // Camera folder (auto-rotate)
    const cameraFolder = tab.pages[0].addFolder({ title: "Camera", expanded: false });
    cameraFolder.addBinding(controls, "autoRotate");
    cameraFolder.addBinding(controls, "autoRotateSpeed", { min: 0, max: 2 });

    // Info folder
    const infoFolder = tab.pages[0].addFolder({ title: "Info", expanded: false });
    infoFolder.addBinding(params, "treeCount", { label: "trees", readonly: true });
    infoFolder.addBinding(params, "vertexCount", {
      label: "vertices",
      format: (v) => v ? v.toFixed(0) : "0",
      readonly: true,
    });
    infoFolder.addBinding(params, "triangleCount", {
      label: "triangles",
      format: (v) => v ? v.toFixed(0) : "0",
      readonly: true,
    });

    // Tree count slider (main control)
    pane.addBinding(params, "treeCount", {
      label: "Tree Count",
      min: 1,
      max: 50,
      step: 1,
    }).on("change", (e) => {
      createForest(e.value);
      // update info display
      params.treeCount = e.value;
      pane.refresh();
    });

    // ensure the UI reflects current settings
    pane.refresh();

    // --- ANIMATION LOOP ---
    const animate = () => {
      requestAnimationFrame(animate);
      stats.begin();
      controls.update();
      renderer.render(scene, camera);
      stats.end();
    };
    animate();

    // --- RESIZE ---
    const handleResize = () => {
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // --- CLEANUP ---
    return () => {
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      pane.dispose();
      if (mountRef.current?.contains(renderer.domElement)) mountRef.current.removeChild(renderer.domElement);
      if (mountRef.current?.contains(stats.dom)) mountRef.current.removeChild(stats.dom);
      scene.clear();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100vh",
        background: "#ffffff",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        ref={uiContainerRef}
        id="ui-container"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "360px",
          height: "100%",
          background: "rgba(255,255,255,0.)",
          overflowY: "auto",
          padding: "8px",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
