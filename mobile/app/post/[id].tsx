import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getPost, ApiError } from "../../src/api/client";
import { resolvePath } from "../../src/links/resolvePath";
import type { Post } from "../../src/api/types";

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        setPost(await getPost(id));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load this post.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>{error ?? "Post not found."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {post.author ? (
        <Pressable onPress={() => resolvePath(`/${post.author}`)}>
          <Text style={styles.author}>@{post.author}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.body}>{post.body}</Text>
      <Text style={styles.mutedText}>
        {post.likeCount} likes · {post.replyCount} replies · {post.repostCount} reposts
      </Text>
      <Text style={styles.mutedText}>{new Date(post.createdAt).toLocaleString()}</Text>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  container: { flex: 1, padding: 24, gap: 12 },
  author: { fontWeight: "600", fontSize: 16 },
  body: { fontSize: 16 },
  mutedText: { color: "#666" },
  link: { color: "#0645ad", marginTop: 12 },
});
