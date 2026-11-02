"""
アンジー（雌ライオン、伏せ）の様式化モデル v2。
Blender の Python で実行する（mcp-for-blender の execute_code 経由、または blender -b -P）。
プリミティブの組み合わせではなく、断面リングのロフトを 1 枚の面でつなぎ、
Mirror と Subdivision Surface で丸める。すべてコードで生成し、外部素材は使わない。

出力: OUT_PATH（glb）。座標は Blender（Z up、-Y が前）。glTF 書き出しで Y up / +Z 前になる。
"""
import bpy, bmesh, math, os

OUT_PATH = os.environ.get("ANGIE_OUT", "/Users/kobayashikunihiro/apps/animal-world-live/public/models/angie-v2.glb")
N = 9  # 半リングの点数（上 x=0 → 下 x=0）

# ---------- シーン掃除 ----------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
    for d in list(coll):
        if d.users == 0:
            coll.remove(d)

def world_loc(ob):
    """親子チェーンに回転が無い前提で、世界座標の位置を足し上げる"""
    x = y = z = 0.0
    while ob is not None:
        x += ob.location[0]; y += ob.location[1]; z += ob.location[2]
        ob = ob.parent
    return (x, y, z)

def material(name, hexcol):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    r = int(hexcol[1:3], 16) / 255; g = int(hexcol[3:5], 16) / 255; b = int(hexcol[5:7], 16) / 255
    # sRGB → Linear
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (lin(r), lin(g), lin(b), 1)
        bsdf.inputs["Roughness"].default_value = 0.9
    return m

MAT = {
    "Tawny": material("Tawny", "#d9a95f"),
    "Belly": material("Belly", "#efd6a8"),
    "Dark": material("Dark", "#6a4727"),
    "Nose": material("Nose", "#3a2a22"),
}

def half_ring(cy, cz, rx, rz, floor=None, top_flat=1.0, squash=1.0):
    """右半分の断面（x>=0）。上から下へ。floor で地面に押しつぶす"""
    pts = []
    for i in range(N):
        t = math.pi * i / (N - 1)
        x = rx * math.sin(t)
        c = math.cos(t)
        z = cz + rz * c * (top_flat if c > 0 else squash)
        if floor is not None:
            z = max(z, floor)
        if i == 0 or i == N - 1:
            x = 0.0
        pts.append((x, cy, z))
    return pts

def loft(name, rings, cap_start=True, cap_end=True, mirror=True, subsurf=2, parent=None, origin=(0, 0, 0)):
    verts = []
    faces = []
    for ring in rings:
        verts.extend(ring)
    for r in range(len(rings) - 1):
        a = r * N
        b = (r + 1) * N
        for i in range(N - 1):
            faces.append((a + i, a + i + 1, b + i + 1, b + i))
    def cap(r_index, flip):
        base = r_index * N
        cy = rings[r_index][0][1]
        cz = sum(p[2] for p in rings[r_index]) / N
        verts.append((0.0, cy, cz))
        c = len(verts) - 1
        for i in range(N - 1):
            f = (base + i, base + i + 1, c)
            faces.append(f[::-1] if flip else f)
    if cap_start:
        cap(0, flip=False)
    if cap_end:
        cap(len(rings) - 1, flip=True)
    # 原点基準へ
    ox, oy, oz = origin
    verts = [(x - ox, y - oy, z - oz) for (x, y, z) in verts]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = origin
    if parent is not None:
        # 親の行列はまだ評価されていないので、逆行列に頼らず親からの相対位置で置く
        ob.parent = parent
        ob.location = tuple(a - b for a, b in zip(origin, world_loc(parent)))
    # 法線をそろえる
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    if mirror:
        mod = ob.modifiers.new("Mirror", "MIRROR")
        mod.use_axis[0] = True
        mod.use_mirror_merge = True
        mod.merge_threshold = 0.002
        mod.use_clip = True
    if subsurf:
        sd = ob.modifiers.new("Subdivision", "SUBSURF")
        sd.levels = subsurf
        sd.render_levels = subsurf
    return ob

def assign(ob, default, rule):
    """rule(face_center) -> material name or None"""
    me = ob.data
    names = ["Tawny", "Belly", "Dark", "Nose"]
    for n in names:
        me.materials.append(MAT[n])
    for p in me.polygons:
        c = p.center
        n = rule((c.x + ob.location.x, c.y + ob.location.y, c.z + ob.location.z)) or default
        p.material_index = names.index(n)

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    bpy.context.collection.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
        e.location = tuple(a - b for a, b in zip(loc, world_loc(parent)))
    return e

# ---------- 胴（尻 → 首のつけ根）。伏せているので下を地面で平らに ----------
G = 0.03  # 地面
body_rings = [
    half_ring(0.86, 0.30, 0.22, 0.26, floor=G),          # 尻の端
    half_ring(0.74, 0.33, 0.36, 0.31, floor=G),          # 尻
    half_ring(0.55, 0.36, 0.42, 0.35, floor=G),          # 腰（折りたたんだ後ろ脚で最も広い）
    half_ring(0.30, 0.40, 0.36, 0.37, floor=G),          # 胴
    half_ring(0.05, 0.45, 0.35, 0.42, floor=G),          # 肋骨
    half_ring(-0.22, 0.55, 0.39, 0.47, floor=G),         # 肩（量感。背中の線より高く）
    half_ring(-0.45, 0.60, 0.35, 0.41, floor=0.16),      # 胸
    half_ring(-0.62, 0.66, 0.26, 0.32, floor=0.30),      # 胸の前
    half_ring(-0.76, 0.76, 0.21, 0.25),                  # 首のつけ根
]
body = loft("Body", body_rings, cap_start=True, cap_end=True)
assign(body, "Tawny", lambda c: "Belly" if (c[2] < 0.22 and -0.5 < c[1] < 0.75) else None)

# ---------- 首と頭（首のつけ根 → 鼻先）。NeckPivot の子にして、首ごと回せるように ----------
neck_pivot = empty("NeckPivot", (0.0, -0.74, 0.74))
# リングを近接して二重に置くと、サブディビジョン後もそこに段が残る（眉の棚、頬と口先の段）
head_rings = [
    half_ring(-0.70, 0.74, 0.21, 0.24),                  # 胴に少し食い込ませる
    half_ring(-0.84, 0.84, 0.22, 0.22),                  # 首
    half_ring(-0.96, 0.94, 0.28, 0.21, top_flat=0.85),   # 後頭部
    half_ring(-1.07, 0.98, 0.34, 0.22, top_flat=0.75),   # 頭蓋（横に広く、上は平ら）
    half_ring(-1.17, 0.98, 0.34, 0.23, top_flat=0.78),   # 眉の棚（上）
    half_ring(-1.20, 0.98, 0.33, 0.23, top_flat=0.78),   # 眉の棚（前。二重）
    half_ring(-1.24, 0.93, 0.30, 0.17, top_flat=0.55),   # 目の下、頬
    half_ring(-1.27, 0.92, 0.29, 0.16, top_flat=0.55),   # 頬（二重）
    half_ring(-1.30, 0.86, 0.17, 0.12, top_flat=0.95),   # 口先のつけ根（段）
    half_ring(-1.32, 0.86, 0.17, 0.12, top_flat=0.95),   # 口先（二重）
    half_ring(-1.40, 0.85, 0.15, 0.11, top_flat=0.95),   # 口先
    half_ring(-1.44, 0.845, 0.11, 0.085),                # 鼻先の手前
    half_ring(-1.46, 0.845, 0.07, 0.06),                 # 鼻先
]
head = loft("Head", head_rings, cap_start=True, cap_end=True, parent=neck_pivot, origin=(0.0, -0.74, 0.74))
assign(head, "Tawny", lambda c: "Belly" if (c[1] < -1.29 and c[2] < 0.85) else None)

# 目: 小さな暗い球（頭の子）
def ball(name, loc, r, mat, parent, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(MAT[mat])
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.scale = scale
    ob.parent = parent
    # loc は世界座標。親（回転なし前提）からの相対位置にする
    ob.location = tuple(a - b for a, b in zip(loc, world_loc(parent)))
    return ob

for side, nm in ((1, "EyeR"), (-1, "EyeL")):
    ball(nm, (side * 0.2, -1.225, 0.985), 0.05, "Nose", head)
ball("NoseTip", (0.0, -1.47, 0.86), 0.05, "Nose", head, scale=(1.3, 0.7, 0.8))

# 耳: 小さなカップ（横寄り、やや外へ倒す）。左右を別オブジェクトにして耳のぴくりを動かせるように
def ear(name, side):
    """耳: 先細りの円錐。前後に薄くし、横へ倒す。内側（前面）は暗い色"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=0.12, radius2=0.05, depth=0.2)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.parent = head
    ob.location = tuple(a - b for a, b in zip((side * 0.3, -1.03, 1.1), world_loc(head)))
    ob.rotation_euler = (-0.15, side * 0.9, 0.0)
    ob.scale = (1.0, 0.45, 1.0)
    sd = ob.modifiers.new("Subdivision", "SUBSURF")
    sd.levels = 1
    sd.render_levels = 1
    assign(ob, "Tawny", lambda c: None)
    # 前面（-Y 側）の面を暗く。ローカル座標で判定する
    for poly in ob.data.polygons:
        if poly.center.y < -0.02:
            poly.material_index = 2
    return ob

ear("EarR", 1)
ear("EarL", -1)

# ---------- 前脚（右。Mirror で左も）。肩から肘へ下り、前へ伸びる ----------
def tube(name, path, radii, parent=None, mirror=True, cap_start=True, cap_end=True, mat_rule=None):
    rings = []
    for (x, y, z), r in zip(path, radii):
        ring = []
        for i in range(N):
            t = math.pi * i / (N - 1)
            ring.append((x + r * math.sin(t), y, z + r * math.cos(t)))
        rings.append(ring)
    ob = loft(name, rings, cap_start=cap_start, cap_end=cap_end, mirror=False, subsurf=2, parent=parent)
    if mirror:
        mod = ob.modifiers.new("Mirror", "MIRROR")
        mod.use_axis[0] = True
        ob.modifiers.move(len(ob.modifiers) - 1, 0)
    assign(ob, "Tawny", mat_rule or (lambda c: None))
    return ob

front_path = [(0.27, -0.50, 0.46), (0.29, -0.66, 0.30), (0.30, -0.82, 0.14), (0.30, -1.05, 0.11), (0.30, -1.25, 0.11), (0.30, -1.36, 0.10)]
front_r = [0.13, 0.12, 0.11, 0.10, 0.115, 0.09]
tube("FrontLegs", front_path, front_r, mat_rule=lambda c: "Belly" if c[1] < -1.2 else None)

# 後ろ脚: 折りたたみ。腰の横から足先が前へ少しのぞく
hind_path = [(0.36, 0.50, 0.14), (0.40, 0.30, 0.10), (0.42, 0.12, 0.09), (0.42, 0.02, 0.08)]
hind_r = [0.14, 0.11, 0.10, 0.09]
tube("HindPaws", hind_path, hind_r, mat_rule=lambda c: "Belly" if c[1] < 0.12 else None)

# ---------- 尾: 後ろから右へ回して地面に沿う。TailPivot の子 ----------
tail_pivot = empty("TailPivot", (0.0, 0.86, 0.30))
tail_pts = [(0.0, 0.0, 0.0), (0.12, 0.22, -0.08), (0.38, 0.40, -0.18), (0.66, 0.42, -0.22), (0.86, 0.30, -0.22)]
curve = bpy.data.curves.new("TailCurve", "CURVE")
curve.dimensions = "3D"
sp = curve.splines.new("NURBS")
sp.points.add(len(tail_pts) - 1)
for p, (x, y, z) in zip(sp.points, tail_pts):
    p.co = (x, y, z, 1.0)
sp.use_endpoint_u = True
curve.bevel_depth = 0.045
curve.bevel_resolution = 3
curve.fill_mode = "FULL"
tail = bpy.data.objects.new("Tail", curve)
bpy.context.collection.objects.link(tail)
tail.parent = tail_pivot
tail.location = (0, 0, 0)
tail.data.materials.append(MAT["Tawny"])
ball("TailTuft", (0.86, 0.86 + 0.30, 0.30 - 0.22), 0.085, "Dark", tail_pivot)

# ---------- 書き出し ----------
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
print("EXPORTED", OUT_PATH, os.path.getsize(OUT_PATH))
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
for ob in bpy.data.objects:
    if ob.type == "MESH":
        ev = ob.evaluated_get(dg)
        xs = [ (ev.matrix_world @ v.co) for v in ev.data.vertices ]
        if xs:
            print(ob.name, "x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]" % (min(v.x for v in xs), max(v.x for v in xs), min(v.y for v in xs), max(v.y for v in xs), min(v.z for v in xs), max(v.z for v in xs)))
