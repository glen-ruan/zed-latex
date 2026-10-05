use zed_extension_api::{self as zed, settings::LspSettings};

struct LatexExtension;

impl zed::Extension for LatexExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        let settings = LspSettings::for_worktree(language_server_id.as_ref(), worktree)?;
        if let Some(binary) = settings.binary {
            if let Some(command) = binary.path {
                return Ok(zed::Command {
                    command,
                    args: binary.arguments.unwrap_or_default(),
                    env: worktree.shell_env(),
                });
            }
        }

        // Embed the companion service into the extension WASM so installation
        // does not depend on an unpublished npm package or project-local scripts.
        let directory = std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join("latex-workshop-server");
        std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        std::fs::write(directory.join("completion.cjs"), include_str!("../server/completion.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("hover.cjs"), include_str!("../server/hover.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("command-help.cjs"), include_str!("../server/command-help.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::create_dir_all(directory.join("data")).map_err(|error| error.to_string())?;
        std::fs::write(directory.join("data/workshop-packages.json"), include_str!("../server/data/workshop-packages.json"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("data/LICENSE.LaTeX-Workshop"), include_str!("../server/data/LICENSE.LaTeX-Workshop"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("package-data.cjs"), include_str!("../server/package-data.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("declarations.cjs"), include_str!("../server/declarations.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("document-commands.cjs"), include_str!("../server/document-commands.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("structure.cjs"), include_str!("../server/structure.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("config-check.cjs"), include_str!("../server/config-check.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("tex-log.cjs"), include_str!("../server/tex-log.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("definition-candidates.cjs"), include_str!("../server/definition-candidates.cjs"))
            .map_err(|e| e.to_string())?;
        std::fs::write(directory.join("environments.cjs"), include_str!("../server/environments.cjs"))
            .map_err(|e| e.to_string())?;
        std::fs::write(directory.join("wrappers.cjs"), include_str!("../server/wrappers.cjs"))
            .map_err(|e| e.to_string())?;
        std::fs::write(directory.join("paths.cjs"), include_str!("../server/paths.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("source-cache.cjs"), include_str!("../server/source-cache.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("core.cjs"), include_str!("../server/core.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("tools.cjs"), include_str!("../server/tools.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("server.cjs"), include_str!("../server/server.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("build-retry.cjs"), include_str!("../server/build-retry.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("build-diagnostics.cjs"), include_str!("../server/build-diagnostics.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("build-report.cjs"), include_str!("../server/build-report.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("references.cjs"), include_str!("../server/references.cjs"))
            .map_err(|error| error.to_string())?;
        std::fs::write(directory.join("log-sync.cjs"), include_str!("../server/log-sync.cjs"))
            .map_err(|error| error.to_string())?;
        let command = match worktree.which("node") {
            Some(command) => command,
            None => zed::node_binary_path()?,
        };
        Ok(zed::Command {
            command,
            args: vec![directory.join("server.cjs").to_string_lossy().into_owned()],
            env: worktree.shell_env(),
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<Option<zed::serde_json::Value>> {
        Ok(LspSettings::for_worktree(language_server_id.as_ref(), worktree)?.settings)
    }
}

zed::register_extension!(LatexExtension);
