// render-core.js - WebGPU renderer: lit globe (land/ocean mask) + graticule +
// coastlines + instanced quake spikes, with a depth buffer (far side occluded)
// and 4x MSAA.
import { GLOBE_SHADER, LINE_SHADER, COAST_SHADER, POINT_SHADER } from "./shaders.js";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.sampleCount = 4;
    this.count = 0;
    this.gratCount = 0;
    this.coastCount = 0;
    this.lost = false;
    this.bg = { r: 0.02, g: 0.03, b: 0.06, a: 1.0 };
  }

  static async supported() { return !!navigator.gpu; }

  async init() {
    if (!navigator.gpu) throw new Error("WebGPU not available in this browser.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No compatible GPU adapter found.");
    this.adapter = adapter;
    this.device = await adapter.requestDevice();
    this.device.lost.then((info) => {
      if (info.reason !== "destroyed") { this.lost = true; console.error("WebGPU device lost:", info.message); }
    });
    this.context = this.canvas.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });
    this._build();
    this.resize();
  }

  _build() {
    const dev = this.device;
    this.uniformBuffer = dev.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uniformData = new Float32Array(28);

    // uniform-only layout (graticule, coastlines)
    const common = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ]});
    // globe layout: uniform + land-mask sampler + texture
    const globeL = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ]});
    const pointsL = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
    ]});
    this.globeLayout = globeL;
    this.pointsLayout = pointsL;
    this.bgCommon = dev.createBindGroup({ layout: common, entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }] });

    // Land-mask sampler + a 1x1 all-ocean placeholder until the real mask loads.
    this.landSampler = dev.createSampler({
      magFilter: "linear", minFilter: "linear",
      addressModeU: "repeat", addressModeV: "clamp-to-edge",
    });
    this.landTex = dev.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    dev.queue.writeTexture({ texture: this.landTex }, new Uint8Array([0, 0, 0, 255]), { bytesPerRow: 4, rowsPerImage: 1 }, [1, 1, 1]);
    this.landView = this.landTex.createView();
    this._rebuildGlobeBG();

    const depth = { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" };
    const depthRO = { format: "depth24plus", depthWriteEnabled: false, depthCompare: "less" };
    const vbuf = [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }];
    const blend = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    const ms = { count: this.sampleCount };
    const commonPL = dev.createPipelineLayout({ bindGroupLayouts: [common] });
    const globePL = dev.createPipelineLayout({ bindGroupLayouts: [globeL] });

    const gm = dev.createShaderModule({ code: GLOBE_SHADER });
    this.globePipe = dev.createRenderPipeline({
      layout: globePL,
      vertex: { module: gm, entryPoint: "vs", buffers: vbuf },
      fragment: { module: gm, entryPoint: "fs", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: depth, multisample: ms,
    });

    const lineOf = (mod) => dev.createRenderPipeline({
      layout: commonPL,
      vertex: { module: mod, entryPoint: "vs", buffers: vbuf },
      fragment: { module: mod, entryPoint: "fs", targets: [{ format: this.format, blend }] },
      primitive: { topology: "line-list" },
      depthStencil: depthRO, multisample: ms,
    });
    this.linePipe = lineOf(dev.createShaderModule({ code: LINE_SHADER }));
    this.coastPipe = lineOf(dev.createShaderModule({ code: COAST_SHADER }));

    const pm = dev.createShaderModule({ code: POINT_SHADER });
    this.pointPipe = dev.createRenderPipeline({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [pointsL] }),
      vertex: { module: pm, entryPoint: "vs" },
      fragment: { module: pm, entryPoint: "fs", targets: [{ format: this.format, blend }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: depthRO, multisample: ms,
    });
  }

  _rebuildGlobeBG() {
    this.bgGlobe = this.device.createBindGroup({ layout: this.globeLayout, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: this.landSampler },
      { binding: 2, resource: this.landView },
    ]});
  }

  // source: ImageBitmap or canvas holding the equirectangular land mask.
  setLandMask(source) {
    if (this.lost || !source) return;
    const dev = this.device;
    const w = source.width, h = source.height;
    if (!w || !h) return;
    if (this.landTex) this.landTex.destroy();
    this.landTex = dev.createTexture({
      size: [w, h, 1], format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    dev.queue.copyExternalImageToTexture({ source, flipY: false }, { texture: this.landTex }, [w, h]);
    this.landView = this.landTex.createView();
    this._rebuildGlobeBG();
  }

  setGlobe(sphere, graticule) {
    const dev = this.device;
    this.globeVerts = dev.createBuffer({ size: sphere.positions.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(this.globeVerts, 0, sphere.positions);
    this.globeIdx = dev.createBuffer({ size: sphere.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(this.globeIdx, 0, sphere.indices);
    this.globeIdxCount = sphere.indices.length;
    this.gratVerts = dev.createBuffer({ size: graticule.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(this.gratVerts, 0, graticule);
    this.gratCount = graticule.length / 3;
  }

  setCoastlines(verts) {
    if (!verts || !verts.length) return;
    if (this.coastVerts) this.coastVerts.destroy();
    this.coastVerts = this.device.createBuffer({ size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.coastVerts, 0, verts);
    this.coastCount = verts.length / 3;
  }

  setPoints(packed, count) {
    this.count = count;
    if (this.pointBuffer && this.pointBuffer.size !== packed.byteLength) { this.pointBuffer.destroy(); this.pointBuffer = null; }
    if (!this.pointBuffer) {
      this.pointBuffer = this.device.createBuffer({ size: packed.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      this.bgPoints = this.device.createBindGroup({ layout: this.pointsLayout, entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.pointBuffer } },
      ]});
    }
    this.device.queue.writeBuffer(this.pointBuffer, 0, packed);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width === w && this.canvas.height === h && this.msaa) return;
    this.canvas.width = w; this.canvas.height = h;
    for (const t of [this.msaa, this.depth]) if (t) t.destroy();
    this.msaa = this.device.createTexture({ size: [w, h], sampleCount: this.sampleCount, format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depth = this.device.createTexture({ size: [w, h], sampleCount: this.sampleCount, format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.msaaView = this.msaa.createView();
    this.depthView = this.depth.createView();
  }

  render(viewProj, state) {
    if (this.lost) return;
    const w = this.canvas.width, h = this.canvas.height;
    const dpr = w / Math.max(1, this.canvas.clientWidth);
    this.uniformData.set(viewProj, 0);
    this.uniformData[16] = state.pointSize * dpr;   // spike width in device px (DPI-consistent)
    this.uniformData[17] = state.currentT;
    this.uniformData[18] = state.minMag;
    this.uniformData[19] = 0;
    this.uniformData[20] = w;
    this.uniformData[21] = h;
    this.uniformData[22] = state.pulseWin ?? 0.02;
    this.uniformData[23] = state.historyFloor ?? 0.22;
    this.uniformData[24] = 0.5; this.uniformData[25] = 0.82; this.uniformData[26] = 0.6; this.uniformData[27] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.msaaView, resolveTarget: this.context.getCurrentTexture().createView(), clearValue: this.bg, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: this.depthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    if (this.globeVerts) {
      pass.setPipeline(this.globePipe);
      pass.setBindGroup(0, this.bgGlobe);
      pass.setVertexBuffer(0, this.globeVerts);
      pass.setIndexBuffer(this.globeIdx, "uint32");
      pass.drawIndexed(this.globeIdxCount);

      pass.setPipeline(this.linePipe);
      pass.setBindGroup(0, this.bgCommon);
      pass.setVertexBuffer(0, this.gratVerts);
      pass.draw(this.gratCount);

      if (this.coastVerts) {
        pass.setPipeline(this.coastPipe);
        pass.setVertexBuffer(0, this.coastVerts);
        pass.draw(this.coastCount);
      }
    }
    if (this.pointBuffer && this.count) {
      pass.setPipeline(this.pointPipe);
      pass.setBindGroup(0, this.bgPoints);
      pass.draw(6, this.count);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }
}
