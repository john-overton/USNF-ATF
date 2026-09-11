extends SceneTree
func _initialize():
    call_deferred("run")
func run():
    DirAccess.make_dir_recursive_absolute("res://output")
    var inputs = {"large":"LargeScaleNoise.tres","medium":"MediumScaleNoise.tres","small":"SmallScaleNoise.tres","coverage":"ExtraLargeScaleNoise.tres","height":"HeightGradient.tres","curl":"curl_noise_varied.tga","dither":"bluenoise_Dither.png"}
    var manifest = {}
    for key in inputs:
        var tex = load("res://NoiseTextures/" + inputs[key])
        if tex is NoiseTexture3D or tex is NoiseTexture2D:
            await tex.changed
        var slices = []
        if tex is Texture3D:
            while tex.get_data().is_empty(): await process_frame
            slices = tex.get_data()
        else:
            while tex.get_image() == null: await process_frame
            slices = [tex.get_image()]
        var bytes = PackedByteArray()
        var rgba = key in ["curl","coverage","height"]
        for im in slices:
            im.clear_mipmaps()
            im.convert(Image.FORMAT_RGBA8 if rgba else Image.FORMAT_R8)
            bytes.append_array(im.get_data())
        var f = FileAccess.open("res://output/" + key + ".bin", FileAccess.WRITE)
        f.store_buffer(bytes)
        manifest[key] = {"width":slices[0].get_width(),"height":slices[0].get_height(),"depth":slices.size(),"channels":4 if rgba else 1}
        print(key, " ", manifest[key], " ", bytes.size())
    var out = FileAccess.open("res://output/manifest.json", FileAccess.WRITE)
    out.store_string(JSON.stringify(manifest, "  "))
    quit()
