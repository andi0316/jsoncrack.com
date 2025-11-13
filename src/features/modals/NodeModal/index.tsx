import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  Group,
  TextInput,
  Alert,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { MdError } from "react-icons/md";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Get editable fields from node (only scalar values)
const getEditableFields = (nodeRows: NodeData["text"]): Record<string, string | number> => {
  const fields: Record<string, string | number> = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object" && row.key) {
      fields[row.key] = row.value ?? "";
    }
  });
  return fields;
};

// Update JSON at a specific path with new values
const updateJsonAtPath = (json: string, path: (string | number)[], updates: Record<string, any>): string => {
  try {
    const parsed = JSON.parse(json);
    let current = parsed;

    // Navigate to the parent of the target object
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      current = current[segment];
      if (current === undefined) {
        throw new Error(`Invalid path at segment ${i}: ${segment}`);
      }
    }

    // Update the target object with new values
    const lastSegment = path[path.length - 1];
    if (current[lastSegment] !== null && typeof current[lastSegment] === "object") {
      Object.keys(updates).forEach(key => {
        current[lastSegment][key] = updates[key];
      });
    }

    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    console.error("Error updating JSON:", error);
    throw error;
  }
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setContents = useFile(state => state.setContents);
  const currentJson = useJson(state => state.json);

  const [isEditMode, setIsEditMode] = React.useState(false);
  const [editedFields, setEditedFields] = React.useState<Record<string, string | number>>({});
  const [error, setError] = React.useState<string | null>(null);

  const editableFields = nodeData ? getEditableFields(nodeData.text) : {};
  const isScalarNode = nodeData?.text.some(row => row.type !== "array" && row.type !== "object");

  // Reset state only when modal opens with a new node
  React.useEffect(() => {
    if (opened && nodeData) {
      setEditedFields(editableFields);
      setIsEditMode(false);
      setError(null);
    } else if (!opened) {
      // Clean up when modal closes
      setIsEditMode(false);
      setError(null);
    }
  }, [opened, nodeData?.id]);

  const handleFieldChange = (key: string, value: string | number) => {
    setEditedFields(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    try {
      setError(null);

      if (!nodeData?.path) {
        setError("Cannot save: path is undefined");
        return;
      }

      // Build the update object with type-converted values
      const updates: Record<string, any> = {};
      Object.keys(editedFields).forEach(key => {
        const value = editedFields[key];
        const originalField = nodeData.text.find(row => row.key === key);

        // Try to convert to original type
        if (originalField?.type === "number") {
          updates[key] = value === "" ? 0 : Number(value);
        } else if (originalField?.type === "boolean") {
          updates[key] = String(value).toLowerCase() === "true";
        } else {
          updates[key] = value;
        }
      });

      // Create updated JSON
      const updatedJson = updateJsonAtPath(currentJson, nodeData.path, updates);
      setContents({ contents: updatedJson });

      // Exit edit mode and close modal
      setIsEditMode(false);
      // Use a small delay to allow state to settle before closing
      setTimeout(() => {
        onClose?.();
      }, 100);
    } catch (err: any) {
      setError(err.message || "Failed to save changes");
    }
  };

  const hasChanges = JSON.stringify(editedFields) !== JSON.stringify(editableFields);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Flex justify="space-between" align="center">
          <Text fz="sm" fw={600}>
            {isEditMode ? "Edit Node" : "Node Details"}
          </Text>
          <CloseButton onClick={onClose} />
        </Flex>

        {error && (
          <Alert icon={<MdError size={16} />} color="red" title="Error">
            {error}
          </Alert>
        )}

        {isEditMode && isScalarNode ? (
          <Stack gap="xs">
            {Object.entries(editableFields).map(([key, value]) => (
              <div key={key}>
                <Text fz="xs" fw={500} mb={4}>
                  {key}
                </Text>
                <TextInput
                  placeholder={`Enter ${key}`}
                  value={editedFields[key] ?? ""}
                  onChange={e => handleFieldChange(key, e.currentTarget.value)}
                  size="sm"
                />
              </div>
            ))}
          </Stack>
        ) : (
          <Stack gap="xs">
            <Stack gap="xs">
              <Flex justify="space-between" align="center">
                <Text fz="xs" fw={500}>
                  Content
                </Text>
              </Flex>
              <ScrollArea.Autosize mah={250} maw={600}>
                <CodeHighlight
                  code={normalizeNodeData(nodeData?.text ?? [])}
                  miw={350}
                  maw={600}
                  language="json"
                  withCopyButton
                />
              </ScrollArea.Autosize>
            </Stack>
            <Stack gap="xs">
              <Text fz="xs" fw={500}>
                JSON Path
              </Text>
              <ScrollArea.Autosize maw={600}>
                <CodeHighlight
                  code={jsonPathToString(nodeData?.path)}
                  miw={350}
                  mah={250}
                  language="json"
                  copyLabel="Copy to clipboard"
                  copiedLabel="Copied to clipboard"
                  withCopyButton
                />
              </ScrollArea.Autosize>
            </Stack>
          </Stack>
        )}

        <Group justify="flex-end" gap="xs">
          {isEditMode ? (
            <>
              <Button variant="light" onClick={() => setIsEditMode(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges}>
                Save Changes
              </Button>
            </>
          ) : (
            isScalarNode && (
              <Button onClick={() => setIsEditMode(true)}>
                Edit Node
              </Button>
            )
          )}
        </Group>
      </Stack>
    </Modal>
  );
};
