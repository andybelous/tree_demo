import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Tree } from "@dgreenheck/ez-tree";

export default function TreeDemo() {
  const mountRef = useRef(null);

  useEffect(() => {
    if (mountRef.current?.dataset.initialized) return;
    mountRef.current.dataset.initialized = "true";

    // === Сцена, камера, рендерер ===
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

    // === Свет ===
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

    // === Плоскость с текстурой травы ===
    const groundSize = 500;
    const textureLoader = new THREE.TextureLoader();
    const grassTexture = textureLoader.load("/textures/grass.jpg");
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(40, 40); // повторяем 40x40 раз, чтобы не тянулось
    grassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const groundMaterial = new THREE.MeshStandardMaterial({
      map: grassTexture,
    });

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      groundMaterial
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // === Контролы ===
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 300;

    // === Расположение деревьев ===
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
        if (tries > 100) break;
      } while (placedPositions.some(p => p.distanceTo(pos) < minDistance));
      placedPositions.push(pos);
      return pos;
    }

    // === Главное дерево по центру ===
    const mainTree = new Tree();
    mainTree.loadPreset("Ash Medium");
    mainTree.options.seed = 12345;
    mainTree.generate();
    mainTree.castShadow = true;
    mainTree.receiveShadow = true;
    mainTree.position.set(0, 0, 0);
    scene.add(mainTree);

    // === Остальные 5 деревьев ===
    for (let i = 0; i < 20; i++) {
      const tree = new Tree();
      tree.loadPreset("Ash Medium");
      tree.options.seed = Math.random() * 100000;
      tree.generate();
      tree.castShadow = true;
      tree.receiveShadow = true;
      const pos = getRandomPosition();
      tree.position.copy(pos);
      scene.add(tree);
    }

    // === Центр вращения — середина дерева ===
    const box = new THREE.Box3().setFromObject(mainTree);
    const treeCenter = new THREE.Vector3();
    box.getCenter(treeCenter);
    controls.target.copy(treeCenter);
    controls.update();

    // === Анимация ===
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // === Resize ===
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect =
        mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight
      );
    };
    window.addEventListener("resize", handleResize);

    // === Очистка ===
    return () => {
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
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
      }}
    />
  );
}
