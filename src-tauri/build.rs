use std::env;

fn main() {
    // Set environment variables for LLVM/Clang compilation
    if cfg!(target_os = "windows") {
        println!("cargo:rustc-env=LIBCLANG_PATH=C:\\Program Files\\LLVM\\bin");
        
        // Set environment variables at build time
        env::set_var("LIBCLANG_PATH", "C:\\Program Files\\LLVM\\bin");
        
        // Configure Windows-specific linking
        println!("cargo:rustc-link-lib=user32");
        println!("cargo:rustc-link-lib=ws2_32");
        println!("cargo:rustc-link-lib=advapi32");
    }
    
    // Configure build for different platforms
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-lib=framework=Security");
        println!("cargo:rustc-link-lib=framework=SystemConfiguration");
        println!("cargo:rustc-link-lib=framework=CoreServices");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }
    
    // Optimize for release builds
    if env::var("PROFILE").map_or(false, |p| p == "release") {
        println!("cargo:rustc-opt-level=3");
        println!("cargo:rustc-codegen-units=1");
        println!("cargo:rustc-lto=fat");
    }
    
    // Run Tauri build
    tauri_build::build();
}
