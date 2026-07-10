import speedometerIcon from "../assets/speedometer.png";

export function SpeedIcon(props: { size?: number; className?: string }) {
  const size = props.size ?? 18;

  return (
    <img
      src={speedometerIcon}
      width={size}
      height={size}
      className={`block shrink-0 object-contain ${props.className ?? ""}`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
