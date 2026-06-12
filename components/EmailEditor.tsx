"use client";

import { Editor } from "@tinymce/tinymce-react";

interface EmailEditorProps {
  value: string;
  onChange: (html: string) => void;
}

const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Gmail-like rich text editor backed by self-hosted TinyMCE.
 * Assets are served from /public/tinymce (copied there by the postinstall
 * script), so there's no cloud API key or CDN dependency. We acknowledge the
 * GPL license with `license_key: "gpl"`.
 *
 * Keeps the same { value, onChange } contract as before, emitting HTML that the
 * Gmail send pipeline turns into a MIME message (inline data-URI images become
 * cid attachments; {name} is personalized per recipient).
 */
export default function EmailEditor({ value, onChange }: EmailEditorProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-accent">
      <Editor
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        licenseKey="gpl"
        value={value}
        onEditorChange={(html) => onChange(html)}
        init={{
          height: 460,
          menubar: false,
          branding: false,
          promotion: false,
          statusbar: false,
          placeholder: "Write your message… use {name} to personalize.",
          plugins: [
            "advlist",
            "autolink",
            "lists",
            "link",
            "image",
            "charmap",
            "emoticons",
            "searchreplace",
            "visualblocks",
            "code",
            "fullscreen",
            "insertdatetime",
            "table",
            "wordcount",
          ],
          toolbar: [
            "undo redo | blocks fontfamily fontsize",
            "bold italic underline strikethrough | forecolor backcolor",
            "alignleft aligncenter alignright | bullist numlist | link image emoticons mergename | removeformat code",
          ].join(" | "),
          // Always show every toolbar button (wrap to more rows) instead of
          // hiding overflow behind a "⋯ more" drawer.
          toolbar_mode: "wrap",
          // px-based font sizes (matches the previous numeric size control).
          font_size_formats:
            "8px 9px 10px 11px 12px 14px 16px 18px 20px 24px 28px 32px 40px 48px",
          font_family_formats:
            "Default=sans-serif;Arial=arial,sans-serif;Georgia=georgia,serif;Times New Roman='times new roman',serif;Courier New='courier new',monospace;Verdana=verdana,sans-serif",
          // Inline images as base64 data URIs; the send pipeline rewrites them to cid.
          paste_data_images: true,
          automatic_uploads: false,
          file_picker_types: "image",
          images_file_types: "jpeg,jpg,png,gif,webp,svg",
          file_picker_callback: (callback, _value, meta) => {
            if (meta.filetype !== "image") return;
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              if (file.size > MAX_INLINE_IMAGE_BYTES) {
                alert("Inline images must be under 2 MB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () =>
                callback(reader.result as string, { title: file.name });
              reader.readAsDataURL(file);
            };
            input.click();
          },
          content_style:
            "body { font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b; } a { color: #e11d48; }",
          setup: (editor) => {
            // "{name}" insert button to match the previous personalization helper.
            editor.ui.registry.addButton("mergename", {
              text: "{name}",
              tooltip: "Insert recipient's name",
              onAction: () => editor.insertContent("{name}"),
            });
          },
        }}
      />
    </div>
  );
}
