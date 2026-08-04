export default function OAuthErrorPage() {
  return (
    <div className="authWrap">
      <div className="authCard">
        <h1>Authorization failed</h1>
        <p className="mutedText">This authorization request is invalid or the application isn&apos;t configured correctly.</p>
      </div>
    </div>
  );
}
