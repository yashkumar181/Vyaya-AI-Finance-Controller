import sys
import os
import pandas as pd

# Path patch: forces Python to recognize the 'backend' directory as a module root
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from app.engine.reconciler import run_reconciliation

def evaluate_metrics(data_dir: str = "backend/data"):
    merged_ledger = run_reconciliation(data_dir)
    ground_truth = pd.read_csv(f"{data_dir}/_ground_truth.csv")
    
    eval_df = pd.merge(
        merged_ledger[['order_id', 'exception_category']].drop_duplicates(subset=['order_id']),
        ground_truth.drop_duplicates(subset=['order_id']),
        on="order_id",
        how="inner"
    )
    
    metrics = []
    categories = eval_df['injected_issue'].dropna().unique().tolist()
    
    for category in categories:
        tp = len(eval_df[(eval_df['exception_category'] == category) & (eval_df['injected_issue'] == category)])
        fp = len(eval_df[(eval_df['exception_category'] == category) & (eval_df['injected_issue'] != category)])
        fn = len(eval_df[(eval_df['exception_category'] != category) & (eval_df['injected_issue'] == category)])
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        
        metrics.append({
            "Category": category,
            "Precision": f"{precision:.2f}",
            "Recall": f"{recall:.2f}"
        })
        
    metrics_df = pd.DataFrame(metrics)
    
    print("\n" + "="*50)
    print("EVALUATION METRICS (PRECISION & RECALL)")
    print("="*50)
    print(metrics_df.to_string(index=False))
    print("="*50)
    
    return metrics_df

if __name__ == "__main__":
    evaluate_metrics("backend/data")