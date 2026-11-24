use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?);
    let proto_dir = manifest.join("../../contracts/proto").canonicalize()?;

    let descriptor = protox::compile(
        ["marketdata.proto", "instruments.proto"],
        [proto_dir.clone()],
    )?;
    tonic_prost_build::configure()
        .build_client(true)
        .build_server(false)
        .compile_fds(descriptor)?;

    for file in [
        "marketdata.proto",
        "instruments.proto",
        "common.proto",
        "google/api/field_behavior.proto",
    ] {
        println!("cargo:rerun-if-changed={}", proto_dir.join(file).display());
    }
    Ok(())
}
